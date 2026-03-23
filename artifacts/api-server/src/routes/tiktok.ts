import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import * as path from "path";

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

export default router;
