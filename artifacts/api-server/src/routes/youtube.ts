import { Router, type IRouter } from "express";
import { google } from "googleapis";
import {
  ResolveChannelIdBody,
  FetchVideosBody,
  FetchTranscriptParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT = {
  client: { clientName: "ANDROID", clientVersion: "20.10.38" },
};
const ANDROID_USER_AGENT = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

async function fetchTranscriptForVideo(videoId: string): Promise<string> {
  // Try InnerTube API first
  try {
    const resp = await fetch(INNERTUBE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_USER_AGENT,
      },
      body: JSON.stringify({ context: INNERTUBE_CLIENT, videoId }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: { baseUrl: string; languageCode: string }[];
          };
        };
      };
      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        const enTrack =
          tracks.find((t) => t.languageCode === "en") || tracks[0];
        if (enTrack?.baseUrl) {
          const transcriptText = await fetchTranscriptFromUrl(enTrack.baseUrl);
          if (transcriptText) return transcriptText;
        }
      }
    }
  } catch {
    // fall through to web page method
  }

  // Fallback: parse YouTube web page
  const pageResp = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  const html = await pageResp.text();

  // Extract caption tracks from ytInitialPlayerResponse
  const varStr = "var ytInitialPlayerResponse = ";
  const idx = html.indexOf(varStr);
  if (idx === -1) return "Unavailable";

  const start = idx + varStr.length;
  let depth = 0;
  let end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  let playerResp: unknown;
  try {
    playerResp = JSON.parse(html.slice(start, end));
  } catch {
    return "Unavailable";
  }

  const tracks = (
    playerResp as {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: { baseUrl: string; languageCode: string }[];
        };
      };
    }
  )?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) return "Unavailable";

  const enTrack = tracks.find((t) => t.languageCode === "en") || tracks[0];
  if (!enTrack?.baseUrl) return "Unavailable";

  return (await fetchTranscriptFromUrl(enTrack.baseUrl)) || "Unavailable";
}

async function fetchTranscriptFromUrl(baseUrl: string): Promise<string> {
  const resp = await fetch(baseUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) return "";
  const xml = await resp.text();
  return parseTranscriptXml(xml);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function parseTranscriptXml(xml: string): string {
  const segments: TranscriptSegment[] = [];
  // New format: <p t="..." d="..."><s>...</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const offset = parseInt(pMatch[1], 10);
    const duration = parseInt(pMatch[2], 10);
    const inner = pMatch[3];
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    let text = "";
    while ((sMatch = sRegex.exec(inner)) !== null) text += sMatch[1];
    if (!text) text = inner.replace(/<[^>]+>/g, "");
    text = decodeEntities(text).trim();
    if (text) segments.push({ text, offset, duration });
  }

  if (segments.length > 0) {
    return segments.map((s) => s.text).join(" ");
  }

  // Old format: <text start="..." dur="...">...</text>
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  const oldSegments: TranscriptSegment[] = [];
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textRegex.exec(xml)) !== null) {
    oldSegments.push({
      text: decodeEntities(textMatch[3]),
      offset: parseFloat(textMatch[1]),
      duration: parseFloat(textMatch[2]),
    });
  }

  return oldSegments.map((s) => s.text).join(" ");
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

router.post("/channel-id", async (req, res) => {
  const parsed = ResolveChannelIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { apiKey, url } = parsed.data;
  const youtube = google.youtube({ version: "v3", auth: apiKey });

  try {
    let channelId: string;
    let channelTitle = "";

    if (url.includes("/channel/")) {
      channelId = url.split("/channel/")[1].split("/")[0].split("?")[0];
    } else if (url.includes("watch?v=") || url.includes("youtu.be/")) {
      let videoId: string;
      if (url.includes("watch?v=")) {
        const match = url.match(/v=([\w-]+)/);
        if (!match) {
          res.status(400).json({ error: "Could not extract video ID from URL" });
          return;
        }
        videoId = match[1];
      } else {
        const match = url.match(/youtu\.be\/([\w-]+)/);
        if (!match) {
          res.status(400).json({ error: "Could not extract video ID from URL" });
          return;
        }
        videoId = match[1];
      }
      const videoResp = await youtube.videos.list({
        part: ["snippet"],
        id: [videoId],
      });
      const item = videoResp.data.items?.[0];
      if (!item) {
        res.status(400).json({ error: "Video not found" });
        return;
      }
      channelId = item.snippet?.channelId || "";
      channelTitle = item.snippet?.channelTitle || "";
    } else if (url.includes("/@")) {
      const handleMatch = url.match(/\/@([^/?]+)/);
      if (!handleMatch) {
        res.status(400).json({ error: "Could not parse channel handle" });
        return;
      }
      const handle = handleMatch[1];
      const searchResp = await youtube.search.list({
        q: `@${handle}`,
        type: ["channel"],
        part: ["snippet"],
        maxResults: 1,
      });
      const item = searchResp.data.items?.[0];
      if (!item) {
        res.status(400).json({ error: `Channel @${handle} not found` });
        return;
      }
      channelId = item.snippet?.channelId || "";
      channelTitle = item.snippet?.channelTitle || "";
    } else if (url.includes("/c/") || url.includes("/user/")) {
      const segment = url.includes("/c/")
        ? url.split("/c/")[1]
        : url.split("/user/")[1];
      const name = segment?.split("/")[0]?.split("?")[0] || "";
      const searchResp = await youtube.search.list({
        q: name,
        type: ["channel"],
        part: ["snippet"],
        maxResults: 1,
      });
      const item = searchResp.data.items?.[0];
      if (!item) {
        res.status(400).json({ error: `Channel "${name}" not found` });
        return;
      }
      channelId = item.snippet?.channelId || "";
      channelTitle = item.snippet?.channelTitle || "";
    } else {
      res.status(400).json({ error: "Unrecognized YouTube URL format" });
      return;
    }

    if (!channelTitle && channelId) {
      const channelResp = await youtube.channels.list({
        part: ["snippet"],
        id: [channelId],
      });
      channelTitle = channelResp.data.items?.[0]?.snippet?.title || channelId;
    }

    res.json({ channelId, channelTitle });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error resolving channel ID");
    res.status(500).json({ error: msg });
  }
});

router.post("/videos", async (req, res) => {
  const parsed = FetchVideosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { apiKey, channelId, limit, withTranscripts } = parsed.data;
  const youtube = google.youtube({ version: "v3", auth: apiKey });

  try {
    const channelResp = await youtube.channels.list({
      part: ["contentDetails"],
      id: [channelId],
    });

    const uploadsPlaylistId =
      channelResp.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      res
        .status(400)
        .json({ error: "Could not find uploads playlist for channel" });
      return;
    }

    const videoIds: string[] = [];
    let nextPageToken: string | undefined = undefined;

    while (true) {
      const playlistResp = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      const items = playlistResp.data.items || [];
      for (const item of items) {
        const vid = item.snippet?.resourceId?.videoId;
        if (vid) videoIds.push(vid);
      }

      nextPageToken = playlistResp.data.nextPageToken || undefined;

      if (!nextPageToken) break;
      if (limit !== null && limit !== undefined && videoIds.length >= limit)
        break;
    }

    const slicedIds =
      limit !== null && limit !== undefined
        ? videoIds.slice(0, limit)
        : videoIds;

    const videos = [];
    for (let i = 0; i < slicedIds.length; i += 50) {
      const chunk = slicedIds.slice(i, i + 50);
      const detailResp = await youtube.videos.list({
        part: ["snippet", "statistics", "contentDetails"],
        id: chunk,
      });

      for (const v of detailResp.data.items || []) {
        const title = v.snippet?.title || "Unknown";
        const publishedAt = (v.snippet?.publishedAt || "").slice(0, 10);
        const duration = parseDuration(v.contentDetails?.duration || "PT0S");
        const views = v.statistics?.viewCount || "0";
        const likes = v.statistics?.likeCount || "0";
        const comments = v.statistics?.commentCount || "0";
        const videoId = v.id || "";

        let transcript = "N/A";
        if (withTranscripts) {
          try {
            transcript = await fetchTranscriptForVideo(videoId);
          } catch {
            transcript = "Unavailable";
          }
        }

        videos.push({
          videoId,
          title,
          duration,
          views,
          likes,
          comments,
          publishedAt,
          transcript,
        });
      }
    }

    res.json({ videos, total: videos.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error fetching videos");
    res.status(500).json({ error: msg });
  }
});

router.get("/transcript/:videoId", async (req, res) => {
  const parsed = FetchTranscriptParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid videoId" });
    return;
  }
  const { videoId } = parsed.data;

  try {
    const transcript = await fetchTranscriptForVideo(videoId);
    res.json({ videoId, transcript });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Error fetching transcript");
    res.status(500).json({ error: msg });
  }
});

export default router;
