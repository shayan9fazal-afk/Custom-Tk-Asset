import { useAnalyzerFlow } from "@/hooks/use-analyzer-flow"
import { AnalyzerForm } from "@/components/analyzer-form"
import { ResultsTable } from "@/components/results-table"
import { Progress } from "@/components/ui/progress"
import { Activity, AlertCircle, Youtube } from "lucide-react"

export default function Home() {
  const { status, error, results, channelTitle, analyze } = useAnalyzerFlow()

  const isLoading = status === "resolving" || status === "fetching"

  return (
    <div className="min-h-screen w-full pb-20">
      {/* Background image requested in requirements */}
      <div 
        className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}images/dark-mesh-bg.png')` }}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20">
        
        <header className="text-center mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-6 shadow-[0_0_30px_rgba(14,165,233,0.15)] ring-1 ring-primary/20">
            <Youtube className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold glow-text mb-4">
            YouTube Channel Analyzer
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Extract deep insights, metrics, and transcripts from any YouTube channel or video URL instantly.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <div className={`lg:col-span-5 w-full transition-all duration-500 ${results.length > 0 ? 'lg:sticky lg:top-8' : 'lg:col-start-4 lg:col-span-6'}`}>
            <div className="glass-panel rounded-2xl p-6 md:p-8">
              <AnalyzerForm onAnalyze={analyze} isLoading={isLoading} />
              
              {isLoading && (
                <div className="mt-8 space-y-3 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4 animate-pulse" />
                      {status === "resolving" ? "Resolving Channel ID..." : "Fetching Video Data..."}
                    </span>
                    <span className="text-muted-foreground">Please wait</span>
                  </div>
                  <Progress value={status === "resolving" ? 30 : 75} className="h-1.5" />
                  {status === "fetching" && (
                    <p className="text-xs text-muted-foreground text-center">
                      Fetching transcripts might take a while depending on the video length.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 animate-in fade-in zoom-in-95">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 w-full">
            {status === "idle" && results.length === 0 && (
              <div className="hidden lg:flex h-full min-h-[400px] flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-2xl bg-card/30 backdrop-blur-sm text-muted-foreground">
                <Youtube className="w-12 h-12 opacity-20 mb-4" />
                <p>Enter your API key and a URL to begin analysis.</p>
                <p className="text-sm mt-2 opacity-70">Results will appear here.</p>
              </div>
            )}

            {(status === "success" || results.length > 0) && (
              <ResultsTable data={results} channelTitle={channelTitle} />
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
