import { useState } from "react"
import { Search, Key, Link as LinkIcon, ListVideo, AlignLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AnalyzerFormProps {
  onAnalyze: (params: {
    apiKey: string;
    url: string;
    limit: number | null;
    withTranscripts: boolean;
  }) => void;
  isLoading: boolean;
}

export function AnalyzerForm({ onAnalyze, isLoading }: AnalyzerFormProps) {
  const [apiKey, setApiKey] = useState("")
  const [url, setUrl] = useState("")
  const [limit, setLimit] = useState<string>("50")
  const [withTranscripts, setWithTranscripts] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey || !url) return
    onAnalyze({
      apiKey,
      url,
      limit: limit === "all" ? null : parseInt(limit, 10),
      withTranscripts,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            YouTube Data API v3 Key
          </Label>
          <Input
            id="apiKey"
            type="password"
            required
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url" className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-primary" />
            Channel or Video URL
          </Label>
          <Input
            id="url"
            type="url"
            required
            placeholder="https://youtube.com/@channel or watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="limit" className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-primary" />
              Max Videos to Fetch
            </Label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger id="limit">
                <SelectValue placeholder="Select limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 Videos</SelectItem>
                <SelectItem value="10">10 Videos</SelectItem>
                <SelectItem value="25">25 Videos</SelectItem>
                <SelectItem value="50">50 Videos</SelectItem>
                <SelectItem value="100">100 Videos</SelectItem>
                <SelectItem value="all">All Videos (Slower)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-3 pt-6">
            <Checkbox
              id="transcripts"
              checked={withTranscripts}
              onCheckedChange={(c) => setWithTranscripts(c as boolean)}
            />
            <Label htmlFor="transcripts" className="flex items-center gap-2 cursor-pointer font-medium">
              <AlignLeft className="w-4 h-4 text-primary" />
              Fetch Transcripts
            </Label>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading || !apiKey || !url}
        className="w-full h-12 text-lg"
      >
        {isLoading ? (
          <>
            <span className="w-5 h-5 mr-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Initializing Analysis...
          </>
        ) : (
          <>
            <Search className="w-5 h-5 mr-2" />
            Start Analysis
          </>
        )}
      </Button>
    </form>
  )
}
