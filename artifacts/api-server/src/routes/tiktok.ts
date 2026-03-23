import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const __filename = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = path.resolve(path.dirname(__filename), "../../..");
const YTDLP_PATH = path.join(WORKSPACE_ROOT, "yt-dlp");

const router: IRouter = Router();

function normalizeHandle(raw: string): string {
  raw = raw.trim();
  if (raw.startsWith("http")) return raw;
  const handle = raw.replace(/^@/, "");
  return `https://www.tiktok.com/@${handle}`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const s = Math.floor(Number(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  try {
    const d = new Date(Number(ts) * 1000);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(ts).slice(0, 10);
  }
}

function parseVtt(content: string): string {
  const lines = content.split("\n");
  const textLines: string[] = [];
  let inCue = false;
  let prevText = "";

  for (const line of lines) {
    if (line.includes("-->")) {
      inCue = true;
      continue;
    }
    if (!line.trim()) {
      inCue = false;
      continue;
    }
    if (inCue) {
      // Strip VTT tags like <00:00:02.160><c> and </c>
      const clean = line
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (clean && clean !== prevText) {
        textLines.push(clean);
        prevText = clean;
      }
    }
  }

  return textLines.join(" ") || "Unavailable";
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  repost_count?: number;
  share_count?: number;
  timestamp?: number;
  upload_date?: string;
  webpage_url?: string;
  url?: string;
}

function runYtDlpStream(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0 || stdout.trim()) resolve(stdout);
      else reject(new Error(stderr.slice(0, 600)));
    });
    proc.on("error", reject);
  });
}

function runYtDlpSilent(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", () => resolve());
    proc.on("error", reject);
  });
}

router.post("/scrape", async (req, res) => {
  const { handle, limit } = req.body as { handle?: string; limit?: number | null };

  if (!handle) {
    res.status(400).json({ error: "handle is required" });
    return;
  }

  const profileUrl = normalizeHandle(handle);
  const maxItems = limit && limit > 0 ? limit : undefined;

  const args = [
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    "--quiet",
    "--ignore-errors",
    "--extractor-args", "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com",
  ];

  if (maxItems) {
    args.push("--playlist-end", String(maxItems));
  }

  args.push(profileUrl);

  try {
    const raw = await runYtDlpStream(args);

    const videos = [];
    const lines = raw.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as YtDlpEntry;
        const title = entry.title || entry.description || "—";
        videos.push({
          title: title.length > 120 ? title.slice(0, 120) + "…" : title,
          duration: fmtDuration(entry.duration),
          views: fmtNumber(entry.view_count),
          likes: fmtNumber(entry.like_count),
          comments: fmtNumber(entry.comment_count),
          shares: fmtNumber(entry.repost_count ?? entry.share_count),
          date: fmtDate(entry.timestamp),
          url: entry.webpage_url || entry.url || "—",
          transcript: undefined as string | undefined,
        });
      } catch {
        // skip malformed lines
      }
    }

    res.json({ videos, total: videos.length, profileUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error scraping TikTok channel");
    res.status(500).json({ error: msg });
  }
});

router.post("/transcript", async (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const tmpDir = os.tmpdir();
  const tmpBase = path.join(tmpDir, `ttsub_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const outputTemplate = `${tmpBase}.%(ext)s`;

  const args = [
    "--write-auto-sub",
    "--write-sub",
    "--sub-lang", "en,en-US,en-orig",
    "--skip-download",
    "--no-warnings",
    "--quiet",
    "--ignore-errors",
    "-o", outputTemplate,
    url,
  ];

  try {
    await runYtDlpSilent(args);

    // Find any generated subtitle file with our base name
    const allFiles = fs.readdirSync(tmpDir);
    const subFiles = allFiles.filter(f =>
      f.startsWith(path.basename(tmpBase)) && (f.endsWith(".vtt") || f.endsWith(".srt") || f.endsWith(".ass"))
    );

    if (subFiles.length === 0) {
      res.json({ url, transcript: "Unavailable" });
      return;
    }

    const subPath = path.join(tmpDir, subFiles[0]);
    const content = fs.readFileSync(subPath, "utf-8");

    // Clean up
    for (const f of subFiles) {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* ignore */ }
    }

    const transcript = parseVtt(content);
    res.json({ url, transcript });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error fetching TikTok transcript");
    res.json({ url, transcript: "Unavailable" });
  }
});

export default router;
