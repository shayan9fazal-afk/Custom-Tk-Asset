import { Router, type IRouter } from "express";
import * as crypto from "crypto";

const router: IRouter = Router();

// ── In-memory session store ───────────────────────────────────────────────
interface MoodleSession {
  baseUrl: string;
  cookies: string;
  sesskey: string;
  createdAt: number;
}
const sessions = new Map<string, MoodleSession>();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function makeSessionId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function getSession(id: string): MoodleSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function moodleHeaders(cookies: string) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Cookie: cookies,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function extractSetCookies(resp: Response): string {
  const raw = resp.headers.getSetCookie?.() ?? [];
  return raw.map((c: string) => c.split(";")[0]).join("; ");
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function normalizeBase(raw: string): string {
  raw = raw.trim().replace(/\/$/, "");
  if (!raw.startsWith("http")) raw = "https://" + raw;
  return raw;
}

const VIDEO_EXTS = [".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv", ".m4v"];

function isVideoUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTS.some((e) => p.endsWith(e)) || p.includes("pluginfile.php");
  } catch {
    return false;
  }
}

// Simple HTML helpers (avoids needing cheerio in every route)
function extractHtmlLinks(html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    links.push({ href, text });
  }
  return links;
}

function extractInputValue(html: string, name: string): string {
  const re = new RegExp(
    `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
    "i"
  );
  const m = re.exec(html);
  if (m) return m[1];
  // alternate attribute order
  const re2 = new RegExp(
    `<input[^>]+value=["']([^"']*)["'][^>]+name=["']${name}["']`,
    "i"
  );
  const m2 = re2.exec(html);
  return m2 ? m2[1] : "";
}

function extractVideoSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

// ── POST /api/moodle/login ────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { baseUrl: rawBase, username, password } = req.body as {
    baseUrl?: string;
    username?: string;
    password?: string;
  };

  if (!rawBase || !username || !password) {
    res.status(400).json({ error: "baseUrl, username and password are required" });
    return;
  }

  const baseUrl = normalizeBase(rawBase);
  const loginUrl = `${baseUrl}/login/index.php`;

  try {
    // Step 1: GET login page to get logintoken + session cookie
    const getResp = await fetch(loginUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!getResp.ok) {
      res.status(502).json({ error: `Could not reach ${loginUrl}: HTTP ${getResp.status}` });
      return;
    }

    const initCookies = extractSetCookies(getResp);
    const html = await getResp.text();
    const logintoken = extractInputValue(html, "logintoken");

    // Step 2: POST credentials
    const body = new URLSearchParams({
      username,
      password,
      logintoken,
      rememberusername: "1",
    });

    const postResp = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: initCookies,
        Referer: loginUrl,
      },
      body: body.toString(),
      redirect: "follow",
    });

    const postCookies = extractSetCookies(postResp);
    const allCookies = [initCookies, postCookies].filter(Boolean).join("; ");
    const postHtml = await postResp.text();

    const successMarkers = ["log out", "logout", "my courses", "dashboard", "my home", "myhome"];
    const isLoggedIn = successMarkers.some((m) =>
      postHtml.toLowerCase().includes(m)
    );

    if (!isLoggedIn) {
      res.status(401).json({ error: "Login failed — check your credentials" });
      return;
    }

    // Extract sesskey from the logged-in page (needed for Moodle AJAX calls)
    const sesskeyMatch = postHtml.match(/"sesskey":"([^"]+)"/) ||
      postHtml.match(/sesskey=([a-zA-Z0-9]+)/);
    const sesskey = sesskeyMatch ? sesskeyMatch[1] : "";

    const sessionId = makeSessionId();
    sessions.set(sessionId, { baseUrl, cookies: allCookies, sesskey, createdAt: Date.now() });

    res.json({ sessionId, baseUrl, message: "Logged in successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Moodle login error");
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/moodle/courses ───────────────────────────────────────────────
router.get("/courses", async (req, res) => {
  const sessionId = req.query["sessionId"] as string;
  const session = getSession(sessionId);
  if (!session) {
    res.status(401).json({ error: "Session not found or expired — please log in again" });
    return;
  }

  const { baseUrl, cookies, sesskey } = session;
  const courses: { title: string; url: string }[] = [];

  // Strategy 1: Moodle AJAX web service (works for modern Moodle themes)
  if (sesskey) {
    try {
      const ajaxResp = await fetch(
        `${baseUrl}/lib/ajax/service.php?sesskey=${sesskey}&info=core_course_get_enrolled_courses_by_timeline_classification`,
        {
          method: "POST",
          headers: { ...moodleHeaders(cookies), "Content-Type": "application/json" },
          body: JSON.stringify([{
            index: 0,
            methodname: "core_course_get_enrolled_courses_by_timeline_classification",
            args: { offset: 0, limit: 0, classification: "all", sort: "fullname", customfieldname: "", customfieldvalue: "" },
          }]),
        }
      );
      if (ajaxResp.ok) {
        const data = await ajaxResp.json() as Array<{ error?: boolean; data?: { courses?: Array<{ id: number; fullname: string; viewurl: string }> } }>;
        if (Array.isArray(data) && data[0]?.data?.courses) {
          for (const c of data[0].data.courses) {
            if (c.fullname && c.viewurl) {
              courses.push({ title: c.fullname, url: c.viewurl });
            }
          }
        }
      }
    } catch { /* fall through to HTML scraping */ }
  }

  // Strategy 2: Moodle REST web service
  if (courses.length === 0) {
    try {
      const restResp = await fetch(
        `${baseUrl}/webservice/rest/server.php?wsfunction=core_enrol_get_users_courses&moodlewsrestformat=json`,
        {
          method: "POST",
          headers: { ...moodleHeaders(cookies), "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ wstoken: sesskey, userid: "0" }).toString(),
        }
      );
      if (restResp.ok) {
        const data = await restResp.json() as Array<{ id: number; fullname: string }>;
        if (Array.isArray(data)) {
          for (const c of data) {
            if (c.fullname) {
              courses.push({ title: c.fullname, url: `${baseUrl}/course/view.php?id=${c.id}` });
            }
          }
        }
      }
    } catch { /* fall through */ }
  }

  // Strategy 3: HTML scraping across candidate pages
  if (courses.length === 0) {
    const candidateUrls = [
      `${baseUrl}/my/courses.php`,
      `${baseUrl}/my/`,
      `${baseUrl}/course/index.php`,
      `${baseUrl}/`,
    ];
    const seen = new Set<string>();

    for (const pageUrl of candidateUrls) {
      try {
        const resp = await fetch(pageUrl, { headers: moodleHeaders(cookies), redirect: "follow" });
        if (!resp.ok) continue;
        const html = await resp.text();
        const links = extractHtmlLinks(html);

        for (const { href, text } of links) {
          if (href.includes("course/view.php?id=") && text.length > 3) {
            const clean = text.toLowerCase();
            if (["home", "log in", "moodle", "site home"].includes(clean)) continue;
            const fullUrl = resolveUrl(baseUrl, href);
            if (!seen.has(fullUrl)) {
              seen.add(fullUrl);
              courses.push({ title: text, url: fullUrl });
            }
          }
        }
        if (courses.length > 0) break;
      } catch { continue; }
    }
  }

  res.json({ courses, total: courses.length });
});

// ── GET /api/moodle/scan ──────────────────────────────────────────────────
router.get("/scan", async (req, res) => {
  const sessionId = req.query["sessionId"] as string;
  const courseUrl = req.query["courseUrl"] as string;
  const session = getSession(sessionId);

  if (!session) {
    res.status(401).json({ error: "Session expired — please log in again" });
    return;
  }
  if (!courseUrl) {
    res.status(400).json({ error: "courseUrl is required" });
    return;
  }

  const { baseUrl, cookies } = session;

  async function scanPage(url: string): Promise<{ title: string; url: string; type: string }[]> {
    try {
      const resp = await fetch(url, { headers: moodleHeaders(cookies), redirect: "follow" });
      if (!resp.ok) return [];
      const html = await resp.text();
      const found = new Map<string, { title: string; url: string; type: string }>();

      // Direct <a> links to video files / pluginfile.php
      for (const { href, text } of extractHtmlLinks(html)) {
        if (isVideoUrl(href)) {
          const resolved = resolveUrl(baseUrl, href);
          found.set(resolved, { title: text || "Video", url: resolved, type: "direct" });
        }
        if (
          href.includes("youtube.com/watch") ||
          href.includes("youtu.be/") ||
          href.includes("vimeo.com/")
        ) {
          found.set(href, { title: text || "External Video", url: href, type: "external" });
        }
      }

      // Embedded <video>/<source> tags
      for (const src of extractVideoSrcs(html)) {
        if (src && isVideoUrl(src)) {
          const resolved = resolveUrl(baseUrl, src);
          found.set(resolved, { title: "Embedded Video", url: resolved, type: "direct" });
        }
      }

      return Array.from(found.values());
    } catch {
      return [];
    }
  }

  try {
    // Scan the course index page
    const courseResp = await fetch(courseUrl, { headers: moodleHeaders(cookies), redirect: "follow" });
    if (!courseResp.ok) {
      res.status(502).json({ error: `Could not load course page: HTTP ${courseResp.status}` });
      return;
    }
    const courseHtml = await courseResp.text();
    const allVideos = new Map<string, { title: string; url: string; type: string }>();

    // Videos directly on the course page
    for (const v of await scanPage(courseUrl)) {
      allVideos.set(v.url, v);
    }

    // Resource sub-pages
    const resourcePatterns = [
      "mod/resource/view.php",
      "mod/url/view.php",
      "mod/page/view.php",
      "mod/hvp/view.php",
    ];

    const subPageUrls = new Set<string>();
    for (const { href } of extractHtmlLinks(courseHtml)) {
      if (resourcePatterns.some((p) => href.includes(p))) {
        subPageUrls.add(resolveUrl(baseUrl, href));
      }
    }

    // Scan sub-pages (limit to 30 to avoid timeouts)
    const subList = Array.from(subPageUrls).slice(0, 30);
    const subResults = await Promise.allSettled(subList.map(scanPage));

    for (const r of subResults) {
      if (r.status === "fulfilled") {
        for (const v of r.value) {
          allVideos.set(v.url, v);
        }
      }
    }

    const videos = Array.from(allVideos.values());
    res.json({ videos, total: videos.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Moodle scan error");
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/moodle/download-proxy ───────────────────────────────────────
router.get("/download-proxy", async (req, res) => {
  const sessionId = req.query["sessionId"] as string;
  const videoUrl = req.query["videoUrl"] as string;
  const session = getSession(sessionId);

  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  if (!videoUrl) {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  try {
    const upstream = await fetch(videoUrl, {
      headers: {
        ...moodleHeaders(session.cookies),
        Range: req.headers["range"] || "",
      } as Record<string, string>,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    // Forward relevant headers
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const disposition = upstream.headers.get("content-disposition");

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    // Derive a filename for download
    let filename = "video.mp4";
    if (disposition) {
      const m = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
      if (m) filename = decodeURIComponent(m[1].trim());
    } else {
      try {
        const p = new URL(videoUrl).pathname;
        const base = p.split("/").pop();
        if (base && base.includes(".")) filename = decodeURIComponent(base);
      } catch { /* ignore */ }
    }
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    if (upstream.status === 206) res.status(206);

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream body to client
    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          if (!res.write(value)) {
            await new Promise<void>((ok) => res.once("drain", ok));
          }
        }
      } catch {
        res.end();
      }
    };
    pump();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Moodle proxy error");
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
});

export default router;
