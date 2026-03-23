import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GetVideoInfoBody } from "@workspace/api-zod";

const router: IRouter = Router();

const YTDLP_PATH = path.resolve(process.cwd(), "yt-dlp");
const FFMPEG_PATH = "/nix/store/6h39ipxhzp4r5in5g4rhdjz7p7fkicd0-replit-runtime-path/bin/ffmpeg";

function normalizeUrl(raw: string): string {
  const bare11 = /^[\w-]{11}$/.test(raw.trim());
  return bare11 ? `https://www.youtube.com/watch?v=${raw.trim()}` : raw.trim();
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.slice(0, 500)));
    });
    proc.on("error", reject);
  });
}

router.post("/info", async (req, res) => {
  const parsed = GetVideoInfoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const url = normalizeUrl(parsed.data.url);

  try {
    const raw = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--quiet",
      url,
    ]);

    const info = JSON.parse(raw) as {
      id: string;
      title: string;
      thumbnail: string;
      duration: number;
      uploader: string;
      view_count: number;
    };

    res.json({
      videoId: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration || 0,
      uploader: info.uploader || "",
      viewCount: info.view_count || 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error fetching video info");
    res.status(500).json({ error: msg });
  }
});

router.get("/download", async (req, res) => {
  const url = req.query["url"] as string;
  const format = (req.query["format"] as string) || "mp4";
  const quality = (req.query["quality"] as string) || "1080";

  if (!url) {
    res.status(400).json({ error: "url query parameter is required" });
    return;
  }

  const cleanUrl = normalizeUrl(url);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytdl-"));
  const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  try {
    // Build format spec
    let formatSpec: string;
    const args: string[] = [
      "--no-playlist",
      "--ffmpeg-location", FFMPEG_PATH,
      "-o", outputTemplate,
    ];

    if (format === "mp3") {
      formatSpec = "bestaudio/best";
      args.push(
        "-f", formatSpec,
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
      );
    } else {
      const height = quality.replace("p", "");
      formatSpec = [
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

    args.push(cleanUrl);

    await runYtDlp(args);

    // Find the output file
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
