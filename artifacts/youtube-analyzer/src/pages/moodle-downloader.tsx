import { useState } from "react"
import {
  GraduationCap, Lock, Globe, Loader2, AlertCircle, Check,
  ChevronDown, ChevronRight, Download, ExternalLink, Video,
  RefreshCw, Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Course {
  title: string
  url: string
}

interface VideoItem {
  title: string
  url: string
  type: "direct" | "external"
}

export default function MoodleDownloader() {
  const [baseUrl, setBaseUrl] = useState("https://medical.drsadiqali.com")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [courses, setCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)

  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)
  const [courseVideos, setCourseVideos] = useState<Record<string, VideoItem[]>>({})
  const [scanningCourse, setScanningCourse] = useState<string | null>(null)
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({})

  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadDone, setDownloadDone] = useState<string | null>(null)

  async function login() {
    setLogging(true)
    setLoginError(null)
    setSessionId(null)
    setCourses([])
    try {
      const resp = await fetch("/api/moodle/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, username, password }),
      })
      const data = await resp.json() as { sessionId?: string; error?: string }
      if (!resp.ok) throw new Error(data.error || "Login failed")
      setSessionId(data.sessionId!)
      await fetchCourses(data.sessionId!)
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLogging(false)
    }
  }

  async function fetchCourses(sid: string) {
    setLoadingCourses(true)
    try {
      const resp = await fetch(`/api/moodle/courses?sessionId=${sid}`)
      const data = await resp.json() as { courses?: Course[]; error?: string }
      if (!resp.ok) throw new Error(data.error || "Failed to fetch courses")
      setCourses(data.courses || [])
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoadingCourses(false)
    }
  }

  async function scanCourse(course: Course) {
    const sid = sessionId!
    if (expandedCourse === course.url) {
      setExpandedCourse(null)
      return
    }
    setExpandedCourse(course.url)

    if (courseVideos[course.url]) return // already scanned

    setScanningCourse(course.url)
    setScanErrors(prev => { const n = { ...prev }; delete n[course.url]; return n })

    try {
      const resp = await fetch(
        `/api/moodle/scan?sessionId=${sid}&courseUrl=${encodeURIComponent(course.url)}`
      )
      const data = await resp.json() as { videos?: VideoItem[]; error?: string }
      if (!resp.ok) throw new Error(data.error || "Scan failed")
      setCourseVideos(prev => ({ ...prev, [course.url]: data.videos || [] }))
    } catch (e) {
      setScanErrors(prev => ({ ...prev, [course.url]: e instanceof Error ? e.message : "Scan error" }))
    } finally {
      setScanningCourse(null)
    }
  }

  async function downloadVideo(video: VideoItem) {
    if (!sessionId) return
    setDownloading(video.url)
    setDownloadDone(null)
    try {
      const params = new URLSearchParams({ sessionId, videoUrl: video.url })
      const resp = await fetch(`/api/moodle/download-proxy?${params}`)
      if (!resp.ok) {
        const d = await resp.json() as { error?: string }
        throw new Error(d.error || "Download failed")
      }
      const blob = await resp.blob()
      const disposition = resp.headers.get("Content-Disposition") || ""
      const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/)
      const fileName = nameMatch
        ? decodeURIComponent(nameMatch[1].trim().replace(/^["']|["']$/g, ""))
        : video.title + ".mp4"

      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setDownloadDone(video.url)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="min-h-screen w-full pb-20">
      <div
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}images/dark-mesh-bg.png')` }}
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 md:pt-20">

        {/* Header */}
        <header className="text-center mb-10 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-6 shadow-[0_0_30px_rgba(220,38,38,0.15)] ring-1 ring-primary/20">
            <GraduationCap className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold glow-text mb-4">Moodle Downloader</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Log in to any Moodle site, browse your enrolled courses, and download lecture videos.
          </p>
        </header>

        {/* Login card */}
        {!sessionId && (
          <div className="glass-panel rounded-2xl p-6 md:p-8 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <Label htmlFor="moodleUrl" className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Moodle Site URL
              </Label>
              <Input
                id="moodleUrl"
                placeholder="https://medical.drsadiqali.com"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="moodleUser" className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  Username
                </Label>
                <Input
                  id="moodleUser"
                  placeholder="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && login()}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moodlePass">Password</Label>
                <Input
                  id="moodlePass"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && login()}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{loginError}</p>
              </div>
            )}

            <Button
              className="w-full h-12 text-lg"
              onClick={login}
              disabled={logging || !baseUrl || !username || !password}
            >
              {logging ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Logging in…</>
              ) : (
                <><Lock className="w-5 h-5 mr-2" />Log In & Browse Courses</>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Credentials go directly to your Moodle site and are never stored.
            </p>
          </div>
        )}

        {/* Logged-in view */}
        {sessionId && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Session bar */}
            <div className="glass-panel rounded-2xl px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-medium">{baseUrl}</span>
                <span className="text-xs text-muted-foreground">· session active</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSessionId(null)
                  setCourses([])
                  setExpandedCourse(null)
                  setCourseVideos({})
                }}
              >
                Log out
              </Button>
            </div>

            {/* Loading courses */}
            {loadingCourses && (
              <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-muted-foreground">Fetching your enrolled courses…</p>
              </div>
            )}

            {/* Course list */}
            {!loadingCourses && courses.length === 0 && (
              <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-muted-foreground">
                <Search className="w-10 h-10 opacity-20" />
                <p>No courses found. The site may use a different layout.</p>
                <Button variant="outline" size="sm" onClick={() => fetchCourses(sessionId)}>
                  <RefreshCw className="w-4 h-4 mr-2" />Retry
                </Button>
              </div>
            )}

            {!loadingCourses && courses.length > 0 && (
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <p className="font-semibold">
                    Enrolled Courses
                    <span className="ml-2 text-sm text-muted-foreground font-normal">({courses.length})</span>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => fetchCourses(sessionId)}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
                  </Button>
                </div>

                <div className="divide-y divide-border">
                  {courses.map((course) => {
                    const isOpen = expandedCourse === course.url
                    const scanning = scanningCourse === course.url
                    const videos = courseVideos[course.url]
                    const err = scanErrors[course.url]

                    return (
                      <div key={course.url}>
                        {/* Course row */}
                        <button
                          onClick={() => scanCourse(course)}
                          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
                        >
                          <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                          <span className="flex-1 font-medium text-sm">{course.title}</span>
                          {scanning ? (
                            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                          ) : isOpen ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                        </button>

                        {/* Video list */}
                        {isOpen && (
                          <div className="bg-muted/10 border-t border-border">
                            {scanning && (
                              <div className="px-8 py-6 flex items-center gap-3 text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">Scanning course for videos…</span>
                              </div>
                            )}

                            {err && (
                              <div className="px-8 py-4 text-sm text-destructive flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                {err}
                              </div>
                            )}

                            {!scanning && videos && videos.length === 0 && (
                              <div className="px-8 py-6 text-sm text-muted-foreground">
                                No downloadable videos found in this course.
                              </div>
                            )}

                            {!scanning && videos && videos.length > 0 && (
                              <div className="divide-y divide-border/50">
                                {videos.map((v, i) => {
                                  const isDownloading = downloading === v.url
                                  const isDone = downloadDone === v.url

                                  return (
                                    <div
                                      key={i}
                                      className="px-8 py-3 flex items-center gap-3"
                                    >
                                      <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                                      <span className="flex-1 text-sm line-clamp-1" title={v.title}>{v.title}</span>

                                      {v.type === "external" ? (
                                        <a
                                          href={v.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                                        >
                                          <ExternalLink className="w-3 h-3" />Open
                                        </a>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant={isDone ? "outline" : "default"}
                                          onClick={() => downloadVideo(v)}
                                          disabled={isDownloading || !!downloading}
                                          className="shrink-0 h-7 text-xs px-3"
                                        >
                                          {isDownloading ? (
                                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Downloading</>
                                          ) : isDone ? (
                                            <><Check className="w-3 h-3 mr-1 text-primary" />Done</>
                                          ) : (
                                            <><Download className="w-3 h-3 mr-1" />Download</>
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
