import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const __filename = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = path.resolve(path.dirname(__filename), "../../..");
const YTDLP_PATH = path.join(WORKSPACE_ROOT, "yt-dlp");
const FFMPEG_PATH = "/nix/store/6h39ipxhzp4r5in5g4rhdjz7p7fkicd0-replit-runtime-path/bin/ffmpeg";

const router: IRouter = Router();

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0 || stdout.trim()) resolve(stdout);
      else reject(new Error(stderr.slice(0, 800)));
    });
    proc.on("error", reject);
  });
}

function authArgs(username?: string, password?: string): string[] {
  const args: string[] = [];
  if (username && password) {
    args.push("--username", username, "--password", password);
  }
  return args;
}

// POST /api/downloader/info
router.post("/info", async (req, res) => {
  const { url, username, password } = req.body as {
    url?: string;
    username?: string;
    password?: string;
  };

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const args = [
      "--dump-json",
      "--no-playlist",
      "--quiet",
      ...authArgs(username, password),
      url.trim(),
    ];

    const raw = await runYtDlp(args);

    const info = JSON.parse(raw) as {
      id: string;
      title: string;
      thumbnail: string;
      duration: number;
      uploader: string;
      view_count: number;
      webpage_url: string;
      extractor: string;
    };

    res.json({
      videoId: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration || 0,
      uploader: info.uploader || "",
      viewCount: info.view_count || 0,
      sourceUrl: info.webpage_url || url,
      extractor: info.extractor || "generic",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error fetching video info");
    res.status(500).json({ error: msg });
  }
});

// GET /api/downloader/download
router.get("/download", async (req, res) => {
  const url = req.query["url"] as string;
  const format = (req.query["format"] as string) || "mp4";
  const quality = (req.query["quality"] as string) || "1080";
  const username = req.query["username"] as string | undefined;
  const password = req.query["password"] as string | undefined;

  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vdl-"));
  const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  try {
    const args: string[] = [
      "--no-playlist",
      "--ffmpeg-location", FFMPEG_PATH,
      "-o", outputTemplate,
      "--retries", "5",
      "--fragment-retries", "5",
      "--ignore-errors",
      ...authArgs(username, password),
    ];

    if (format === "mp3") {
      args.push(
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
      );
    } else {
      const height = quality.replace("p", "");
      const formatSpec = [
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${height}]+bestaudio`,
        `best[height<=${height}]`,
        "best",
      ].join("/");
      args.push(
        "-f", formatSpec,
        "--merge-output-format", "mp4",
      );
    }

    args.push(url.trim());

    await runYtDlp(args);

    const files = await fs.promises.readdir(tmpDir);
    if (files.length === 0) {
      res.status(500).json({ error: "Download produced no output file" });
      return;
    }

    const filePath = path.join(tmpDir, files[0]);
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(files[0]).slice(1);
    const baseName = files[0];

    const mimeType =
      ext === "mp3" ? "audio/mpeg" :
      ext === "mp4" ? "video/mp4" :
      ext === "webm" ? "video/webm" : "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}`
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on("end", () => {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
    fileStream.on("error", () => {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err: unknown) {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error downloading video");
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
