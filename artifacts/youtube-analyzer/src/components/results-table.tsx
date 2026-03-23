import { useState, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table"
import Papa from "papaparse"
import { ArrowUpDown, Download, Copy, ExternalLink, MessageSquareText } from "lucide-react"
import type { VideoItem } from "@workspace/api-client-react/src/generated/api.schemas"
import { Button } from "@/components/ui/button"
import { parseNumberString, formatNumber, cn } from "@/lib/utils"
import { format, parseISO } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ResultsTableProps {
  data: VideoItem[];
  channelTitle: string | null;
}

const columnHelper = createColumnHelper<VideoItem>()

export function ResultsTable({ data, channelTitle }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedTranscript, setSelectedTranscript] = useState<{title: string, text: string} | null>(null)

  // Custom sort function for numeric strings with K/M suffixes or commas
  const sortNumericString = (rowA: any, rowB: any, columnId: string) => {
    const a = parseNumberString(rowA.getValue(columnId) || '0')
    const b = parseNumberString(rowB.getValue(columnId) || '0')
    return a > b ? 1 : a < b ? -1 : 0
  }

  const columns = useMemo(() => [
    columnHelper.accessor("title", {
      header: "Video Title",
      cell: info => (
        <a 
          href={`https://youtube.com/watch?v=${info.row.original.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-primary transition-colors flex items-start gap-2 max-w-[300px]"
        >
          <span className="line-clamp-2">{info.getValue()}</span>
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-1 opacity-50" />
        </a>
      ),
    }),
    columnHelper.accessor("publishedAt", {
      header: "Published",
      cell: info => {
        try {
          return <span className="text-muted-foreground whitespace-nowrap">{format(parseISO(info.getValue()), 'MMM d, yyyy')}</span>
        } catch {
          return info.getValue()
        }
      },
    }),
    columnHelper.accessor("duration", {
      header: "Duration",
      cell: info => <span className="whitespace-nowrap font-mono text-sm text-muted-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor("views", {
      header: "Views",
      sortingFn: sortNumericString,
      cell: info => <span className="font-mono">{formatNumber(info.getValue())}</span>,
    }),
    columnHelper.accessor("likes", {
      header: "Likes",
      sortingFn: sortNumericString,
      cell: info => <span className="font-mono">{formatNumber(info.getValue())}</span>,
    }),
    columnHelper.accessor("comments", {
      header: "Comments",
      sortingFn: sortNumericString,
      cell: info => <span className="font-mono">{formatNumber(info.getValue())}</span>,
    }),
    columnHelper.accessor("transcript", {
      header: "Transcript",
      enableSorting: false,
      cell: info => {
        const text = info.getValue()
        if (!text) return <span className="text-muted-foreground text-sm italic">N/A</span>
        
        return (
          <div className="min-w-[200px] max-w-[300px]">
            <p className="text-sm text-muted-foreground line-clamp-2 mb-1">{text}</p>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-primary"
              onClick={() => setSelectedTranscript({ title: info.row.original.title, text })}
            >
              Read full
            </Button>
          </div>
        )
      }
    }),
    // Hidden Video ID column just for data completeness if needed
    columnHelper.accessor("videoId", {
      header: "Video ID",
    }),
  ], [])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      columnVisibility: { videoId: false }
    }
  })

  const handleExportCSV = () => {
    const csv = Papa.unparse(data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `youtube-analysis-${channelTitle || 'export'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyTSV = () => {
    const tsv = Papa.unparse(data, { delimiter: '\t' })
    navigator.clipboard.writeText(tsv)
  }

  if (!data || data.length === 0) return null

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-lg">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">
            {channelTitle ? `${channelTitle} Results` : 'Analysis Results'}
          </h2>
          <p className="text-sm text-muted-foreground">Found {data.length} videos</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyTSV}>
            <Copy className="w-4 h-4 mr-2" />
            Copy TSV
          </Button>
          <Button variant="default" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xl shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id} 
                      className="px-4 py-3 font-semibold select-none group whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <div 
                          className={cn(
                            "flex items-center gap-2", 
                            header.column.getCanSort() ? "cursor-pointer hover:text-foreground transition-colors" : ""
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <ArrowUpDown className={cn(
                              "w-3 h-3 transition-opacity",
                              header.column.getIsSorted() ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"
                            )} />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/50">
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id}
                  className="hover:bg-secondary/20 transition-colors group"
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selectedTranscript} onOpenChange={(open) => !open && setSelectedTranscript(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <MessageSquareText className="w-5 h-5" />
              Transcript
            </DialogTitle>
            <p className="text-sm font-medium text-muted-foreground line-clamp-1">{selectedTranscript?.title}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4">
            {selectedTranscript?.text.split('\n').map((para, i) => (
              <p key={i} className="text-foreground/90 leading-relaxed">{para}</p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
