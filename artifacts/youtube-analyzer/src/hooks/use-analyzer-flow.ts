import { useState } from "react";
import { useResolveChannelId, useFetchVideos } from "@workspace/api-client-react";
import type { VideoItem } from "@workspace/api-client-react/src/generated/api.schemas";

export type AnalyzerStatus = "idle" | "resolving" | "fetching" | "success" | "error";

export function useAnalyzerFlow() {
  const [status, setStatus] = useState<AnalyzerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<VideoItem[]>([]);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);

  const resolveMutation = useResolveChannelId();
  const fetchMutation = useFetchVideos();

  const analyze = async (params: {
    apiKey: string;
    url: string;
    limit: number | null;
    withTranscripts: boolean;
  }) => {
    try {
      setStatus("resolving");
      setError(null);
      setResults([]);
      setChannelTitle(null);

      // Step 1: Resolve Channel ID
      const resolveRes = await resolveMutation.mutateAsync({
        data: {
          apiKey: params.apiKey,
          url: params.url,
        }
      });

      setChannelTitle(resolveRes.channelTitle);
      setStatus("fetching");

      // Step 2: Fetch Videos (and Transcripts if requested)
      const fetchRes = await fetchMutation.mutateAsync({
        data: {
          apiKey: params.apiKey,
          channelId: resolveRes.channelId,
          limit: params.limit,
          withTranscripts: params.withTranscripts,
        }
      });

      setResults(fetchRes.videos || []);
      setStatus("success");
    } catch (err: any) {
      console.error("[Analyzer Error]", err);
      setError(err?.message || "An unexpected error occurred during analysis.");
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setError(null);
    setResults([]);
    setChannelTitle(null);
  };

  return {
    status,
    error,
    results,
    channelTitle,
    analyze,
    reset,
  };
}
