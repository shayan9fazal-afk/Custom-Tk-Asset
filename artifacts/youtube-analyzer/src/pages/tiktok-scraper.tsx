import { useState, useRef } from "react"
import {
  Music2, Link as LinkIcon, AlertCircle, Loader2,
  Download, Copy, Check, ArrowUpDown, ExternalLink,
  FileText, ChevronDown, ChevronUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface TikTokVideo {
  title: string
  duration: string
  views: string
  likes: string
  comments: string
  shares: string
  date: string
  url: string
  transcript?: string
}

const COLUMNS: { key: keyof TikTokVideo; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "duration", label: "Duration" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "date", label: "Date" },
]

type SortDir = "asc" | "desc"

function numericVal(s: string): number {
  if (!s || s === "—") return -1
  const n = s.replace(/,/g, "").replace(/M$/, "e6").replace(/K$/, "e3")
  const v = parseFloat(n)
  return isNaN(v) ? -1 : v
}

function TranscriptCell({ text }: { text: string | undefined }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (text === undefined) {
    return <span className="text-muted-foreground text-xs italic">—</span>
  }
  if (text === "Unavailable") {
    return <span className="text-muted-foreground text-xs italic">Unavailable</span>
  }

  function copy() {
    navigator.clipboard.writeText(text ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const preview = text.slice(0, 120)
  const hasMore = text.length > 120

  return (
    <div className="max-w-xs">
      <p className={`text-xs leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>{text}</p>
      <div className="flex items-center gap-2 mt-1">
        {hasMore && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" />Less</> : <><ChevronDown className="w-3 h-3" />More</>}
          </button>
        )}
        <button
          onClick={copy}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          title="Copy transcript"
        >
          {copied ? <><Check className="w-3 h-3 text-primary" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
        </button>
      </div>
    </div>
  )
}

export default function TikTokScraper() {
  const [handle, setHandle] = useState("")
  const [limit, setLimit] = useState("20")
  const [withTranscripts, setWithTranscripts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transcriptProgress, setTranscriptProgress] = useState<{ done: number; total: number } | null>(null)
  const [videos, setVideos] = useState<TikTokVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sortKey, setSortKey] = useState<keyof TikTokVideo | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const abortRef = useRef<AbortController | null>(null)

  async function fetchTranscripts(vids: TikTokVideo[]): Promise<TikTokVideo[]> {
    const updated = [...vids]
    setTranscriptProgress({ done: 0, total: vids.length })

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].url === "—") {
        updated[i] = { ...updated[i], transcript: "Unavailable" }
      } else {
        try {
          const resp = await fetch("/api/tiktok/transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: updated[i].url }),
          })
          const data = await resp.json() as { transcript?: string }
          updated[i] = { ...updated[i], transcript: data.transcript ?? "Unavailable" }
        } catch {
          updated[i] = { ...updated[i], transcript: "Unavailable" }
        }
      }
      // Update state incrementally so rows fill in as they arrive
      setVideos([...updated])
      setTranscriptProgress({ done: i + 1, total: vids.length })
    }

    setTranscriptProgress(null)
    return updated
  }

  async function scrape() {
    if (!handle.trim()) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    setVideos([])
    setSortKey(null)
    setTranscriptProgress(null)

    try {
      const resp = await fetch("/api/tiktok/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim(),
          limit: limit === "all" ? null : parseInt(limit, 10),
        }),
        signal: abortRef.current.signal,
      })
      const data = await resp.json() as { videos?: TikTokVideo[]; error?: string }
      if (!resp.ok) throw new Error(data.error || "Scrape failed")

      const vids = data.videos || []
      setVideos(vids)
      setLoading(false)

      if (withTranscripts && vids.length > 0) {
        await fetchTranscripts(vids)
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Unknown error")
      }
      setLoading(false)
    }
  }

  function handleSort(key: keyof TikTokVideo) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...videos].sort((a, b) => {
    if (!sortKey) return 0
    const aStr = a[sortKey] ?? ""
    const bStr = b[sortKey] ?? ""
    const numericCols = ["views", "likes", "comments", "shares"]
    let cmp: number
    if (numericCols.includes(sortKey)) {
      cmp = numericVal(aStr) - numericVal(bStr)
    } else {
      cmp = aStr.localeCompare(bStr)
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  const hasTranscripts = videos.some(v => v.transcript !== undefined)

  function exportCsv() {
    if (!videos.length) return
    const cols = [...COLUMNS, ...(hasTranscripts ? [{ key: "transcript" as keyof TikTokVideo, label: "Transcript" }] : []), { key: "url" as keyof TikTokVideo, label: "URL" }]
    const header = cols.map(c => c.label).join(",")
    const rows = videos.map(v =>
      cols.map(c => `"${(v[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tiktok_${handle.replace(/[@/]/g, "")}_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyClipboard() {
    if (!videos.length) return
    const cols = [...COLUMNS, ...(hasTranscripts ? [{ key: "transcript" as keyof TikTokVideo, label: "Transcript" }] : []), { key: "url" as keyof TikTokVideo, label: "URL" }]
    const header = cols.map(c => c.label).join("\t")
    const rows = videos.map(v => cols.map(c => v[c.key] ?? "").join("\t"))
    navigator.clipboard.writeText([header, ...rows].join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isWorking = loading || transcriptProgress !== null

  return (
    <div className="min-h-screen w-full pb-20">
      <div
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}images/dark-mesh-bg.png')` }}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 md:pt-20">

        <header className="text-center mb-10 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-6 shadow-[0_0_30px_rgba(220,38,38,0.15)] ring-1 ring-primary/20">
            <Music2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold glow-text mb-4">TikTok Scraper</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Scrape public video metadata and transcripts from any TikTok profile. No API key or login needed.
          </p>
        </header>

        {/* Input card */}
        <div className="glass-panel rounded-2xl p-6 md:p-8 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="tt-handle" className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                TikTok Username or URL
              </Label>
              <Input
                id="tt-handle"
                placeholder="@username  or  https://tiktok.com/@username"
                value={handle}
                onChange={e => setHandle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !isWorking && scrape()}
              />
            </div>

            <div className="w-40 space-y-2">
              <Label>Video Limit</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 videos</SelectItem>
                  <SelectItem value="20">20 videos</SelectItem>
                  <SelectItem value="50">50 videos</SelectItem>
                  <SelectItem value="100">100 videos</SelectItem>
                  <SelectItem value="200">200 videos</SelectItem>
                  <SelectItem value="500">500 videos</SelectItem>
                  <SelectItem value="all">All videos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={scrape}
              disabled={isWorking || !handle.trim()}
              className="h-10 px-6 shrink-0"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scraping…</>
              ) : transcriptProgress ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Transcripts…</>
              ) : (
                "Scrape Channel"
              )}
            </Button>
          </div>

          {/* Transcript toggle */}
          <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Fetch Transcripts</p>
                <p className="text-xs text-muted-foreground">
                  Auto-generated captions via yt-dlp — may be slow for large sets
                </p>
              </div>
            </div>
            <Switch
              checked={withTranscripts}
              onCheckedChange={setWithTranscripts}
              disabled={isWorking}
            />
          </div>

          {/* Transcript progress */}
          {transcriptProgress && (
            <div className="mt-4 space-y-2 animate-in fade-in">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="text-primary font-medium flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Fetching transcripts…
                </span>
                <span>{transcriptProgress.done} / {transcriptProgress.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(transcriptProgress.done / transcriptProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 animate-in fade-in zoom-in-95">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-4 animate-in fade-in">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground">Fetching metadata from TikTok… this may take a moment.</p>
          </div>
        )}

        {/* Results */}
        {!loading && videos.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <p className="text-sm text-muted-foreground font-medium">
                <span className="text-foreground font-semibold">{videos.length}</span> videos scraped
                {transcriptProgress && (
                  <span className="ml-2 text-primary text-xs">
                    · transcripts {transcriptProgress.done}/{transcriptProgress.total}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={copyClipboard}>
                  {copied ? <Check className="w-4 h-4 mr-1.5 text-primary" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copied ? "Copied!" : "Copy TSV"}
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="w-4 h-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {COLUMNS.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap group"
                      >
                        <span className="flex items-center gap-1.5">
                          {col.label}
                          <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === col.key ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"}`} />
                        </span>
                      </th>
                    ))}
                    {hasTranscripts && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3" />
                          Transcript
                        </span>
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      Link
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((v, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <span className="line-clamp-2 leading-snug">{v.title}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{v.duration}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-right">{v.views}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-right">{v.likes}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-right">{v.comments}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-right">{v.shares}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{v.date}</td>
                      {hasTranscripts && (
                        <td className="px-4 py-3">
                          {v.transcript === undefined && transcriptProgress ? (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          ) : (
                            <TranscriptCell text={v.transcript} />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {v.url !== "—" ? (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && videos.length === 0 && !error && (
          <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-4 text-center text-muted-foreground">
            <Music2 className="w-12 h-12 opacity-20" />
            <p>Enter a TikTok username or URL and click Scrape Channel.</p>
            <p className="text-sm opacity-70">Results will appear here — no login or API key needed.</p>
          </div>
        )}

      </main>
    </div>
  )
}
