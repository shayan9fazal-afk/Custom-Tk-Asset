import { useState } from "react"
import { Download, Link as LinkIcon, Music, Video, AlertCircle, Loader2, ExternalLink, Clock, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VideoInfo {
  videoId: string
  title: string
  thumbnail: string
  duration: number
  uploader: string
  viewCount: number
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`
  return `${count} views`
}

export default function Downloader() {
  const [url, setUrl] = useState("")
  const [format, setFormat] = useState<"mp4" | "mp3">("mp4")
  const [quality, setQuality] = useState("1080")
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [fetching, setFetching] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadDone, setDownloadDone] = useState(false)

  async function fetchInfo() {
    if (!url.trim()) return
    setFetching(true)
    setError(null)
    setInfo(null)
    setDownloadDone(false)
    try {
      const resp = await fetch("/api/downloader/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await resp.json() as VideoInfo & { error?: string }
      if (!resp.ok) throw new Error(data.error || "Failed to fetch video info")
      setInfo(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setFetching(false)
    }
  }

  async function startDownload() {
    if (!info) return
    setDownloading(true)
    setError(null)
    setDownloadDone(false)
    try {
      const params = new URLSearchParams({
        url: url.trim(),
        format,
        quality,
      })
      const resp = await fetch(`/api/downloader/download?${params.toString()}`)
      if (!resp.ok) {
        const errData = await resp.json() as { error?: string }
        throw new Error(errData.error || "Download failed")
      }
      const blob = await resp.blob()
      const disposition = resp.headers.get("Content-Disposition") || ""
      const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/)
      const fileName = nameMatch
        ? decodeURIComponent(nameMatch[1].trim().replace(/^["']|["']$/g, ""))
        : `${info.title}.${format}`

      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setDownloadDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen w-full pb-20">
      <div
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}images/dark-mesh-bg.png')` }}
      />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-12 md:pt-20">
        <header className="text-center mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-6 shadow-[0_0_30px_rgba(220,38,38,0.15)] ring-1 ring-primary/20">
            <Download className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold glow-text mb-4">
            YT Downloader
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Download any YouTube video as MP4 or extract audio as MP3. Paste a URL to get started.
          </p>
        </header>

        <div className="glass-panel rounded-2xl p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* URL input */}
          <div className="space-y-2">
            <Label htmlFor="dlUrl" className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-primary" />
              YouTube Video URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="dlUrl"
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setInfo(null)
                  setError(null)
                  setDownloadDone(false)
                }}
                onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
                className="flex-1"
              />
              <Button
                onClick={fetchInfo}
                disabled={fetching || !url.trim()}
                variant="outline"
                className="shrink-0"
              >
                {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
              </Button>
            </div>
          </div>

          {/* Format and Quality */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {format === "mp3" ? <Music className="w-4 h-4 text-primary" /> : <Video className="w-4 h-4 text-primary" />}
                Format
              </Label>
              <Select value={format} onValueChange={(v) => setFormat(v as "mp4" | "mp3")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (Video)</SelectItem>
                  <SelectItem value="mp3">MP3 (Audio only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {format === "mp4" && (
              <div className="space-y-2">
                <Label>Quality</Label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2160">4K (2160p)</SelectItem>
                    <SelectItem value="1440">1440p</SelectItem>
                    <SelectItem value="1080">1080p (FHD)</SelectItem>
                    <SelectItem value="720">720p (HD)</SelectItem>
                    <SelectItem value="480">480p</SelectItem>
                    <SelectItem value="360">360p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 animate-in fade-in zoom-in-95">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Video preview card */}
          {info && (
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden animate-in fade-in zoom-in-95 duration-400">
              <div className="relative">
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-white font-semibold text-sm line-clamp-2">{info.title}</p>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(info.duration)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  {formatViews(info.viewCount)}
                </span>
                <a
                  href={`https://youtube.com/watch?v=${info.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open
                </a>
              </div>
            </div>
          )}

          {/* Download button */}
          <Button
            className="w-full h-12 text-lg"
            onClick={startDownload}
            disabled={!info || downloading || fetching}
          >
            {downloading ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                Downloading... (may take a moment)
              </>
            ) : downloadDone ? (
              <>
                <Download className="w-5 h-5 mr-2" />
                Downloaded! Download again?
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                {info ? `Download as ${format.toUpperCase()}` : "Preview a video first"}
              </>
            )}
          </Button>

          {downloadDone && (
            <p className="text-center text-sm text-primary animate-in fade-in">
              Your file has been saved to your Downloads folder.
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Downloads are processed server-side. Large files may take a minute. For personal use only.
          </p>
        </div>
      </main>
    </div>
  )
}
