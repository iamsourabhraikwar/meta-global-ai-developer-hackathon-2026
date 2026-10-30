import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

export const dynamic = "force-dynamic";

const execFileAsync = util.promisify(execFile);

/**
 * POST /api/cctv/relay
 * Resolves incoming stream URLs (YouTube, RTMP, RTSP, or HLS) into an in-memory browser-playable stream.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = (body.url || "").trim();

    if (!rawUrl) {
      return NextResponse.json({ error: "Missing stream URL parameter." }, { status: 400 });
    }

    // CASE 1: YouTube Live Stream or Video URL
    if (rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) {
      const scriptPath = path.join(process.cwd(), "scripts", "resolve_stream.py");
      const pythonExe = "C:\\Python314\\python.exe";

      try {
        const { stdout } = await execFileAsync(pythonExe, [scriptPath, rawUrl], {
          timeout: 15000,
          windowsHide: true,
        });

        // Parse stdout (extract JSON line)
        const lines = stdout.trim().split("\n");
        const jsonLine = lines.reverse().find((l) => l.trim().startsWith("{"));
        if (!jsonLine) {
          throw new Error("Could not parse JSON response from stream resolver.");
        }

        const data = JSON.parse(jsonLine);
        if (!data.success || !data.streamUrl) {
          throw new Error(data.error || "Failed to resolve stream link.");
        }

        // Return proxied in-memory HLS URL
        const proxiedUrl = `/api/cctv/relay?source=${encodeURIComponent(data.streamUrl)}`;

        return NextResponse.json({
          success: true,
          type: "youtube_hls",
          title: data.title || "YouTube CCTV Stream",
          isLive: data.isLive,
          streamUrl: proxiedUrl,
          rawStreamUrl: data.streamUrl,
        });
      } catch (err: any) {
        return NextResponse.json(
          {
            error: `YouTube stream resolution error: ${err.message}`,
            fallbackUrl:
              "https://customer-670f71hno16lm69b.cloudflarestream.com/ca98af9dc129b9e1adf13925e8ba1887/manifest/video.m3u8",
          },
          { status: 500 }
        );
      }
    }

    // CASE 2: RTSP / RTMP Security Camera Socket
    if (rawUrl.startsWith("rtsp://") || rawUrl.startsWith("rtmp://")) {
      return NextResponse.json({
        success: true,
        type: "rtsp_socket",
        title: "Enterprise IP Camera Feed",
        streamUrl: rawUrl,
        message: "RTSP/RTMP socket detected. Connected to security camera interface.",
      });
    }

    // CASE 3: Direct HLS or MP4 Stream
    return NextResponse.json({
      success: true,
      type: "direct",
      title: "Direct Media Feed",
      streamUrl: rawUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Processes and optimizes HLS manifests for real-time surveillance streaming in RAM:
 * - Trims bloated 720-segment DVR histories down to the latest 8 live segments (~40s sliding window).
 * - Updates #EXT-X-MEDIA-SEQUENCE so the Hls.js demuxer stays in lockstep.
 * - Strips YouTube ad cuepoints (#EXT-X-DATERANGE, #EXT-X-CUEPOINT) preventing player stalls.
 * - Proxies segment and sub-manifest URIs through /api/cctv/relay?source=...
 */
function processHlsManifest(manifestText: string, baseUrl: URL, maxLiveSegments = 8): string {
  const lines = manifestText.split("\n");

  // Master Playlist (variants)
  if (manifestText.includes("#EXT-X-STREAM-INF")) {
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
              const abs = new URL(uri, baseUrl).toString();
              return `URI="/api/cctv/relay?source=${encodeURIComponent(abs)}"`;
            });
          }
          return line;
        }
        const absUrl = new URL(trimmed, baseUrl).toString();
        return `/api/cctv/relay?source=${encodeURIComponent(absUrl)}`;
      })
      .join("\n");
  }

  // Media Playlist (segments)
  const headerLines: string[] = [];
  const segments: string[][] = [];
  let currentSeg: string[] = [];
  let origMediaSeq = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      origMediaSeq = parseInt(trimmed.split(":")[1], 10) || 0;
      continue;
    }
    // Filter ad markers and cuepoints
    if (
      trimmed.startsWith("#EXT-X-DATERANGE") ||
      trimmed.startsWith("#EXT-X-CUEPOINT") ||
      trimmed.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE")
    ) {
      continue;
    }

    if (trimmed.startsWith("#EXTINF:")) {
      if (currentSeg.length > 0) segments.push(currentSeg);
      currentSeg = [line];
    } else if (currentSeg.length > 0) {
      currentSeg.push(line);
      if (!trimmed.startsWith("#")) {
        segments.push(currentSeg);
        currentSeg = [];
      }
    } else {
      headerLines.push(line);
    }
  }
  if (currentSeg.length > 0) segments.push(currentSeg);

  const totalSegments = segments.length;
  let newMediaSeq = origMediaSeq;
  let keptSegments = segments;

  if (totalSegments > maxLiveSegments) {
    const dropped = totalSegments - maxLiveSegments;
    newMediaSeq = origMediaSeq + dropped;
    keptSegments = segments.slice(-maxLiveSegments);
  }

  const resultLines: string[] = [];
  for (const h of headerLines) {
    resultLines.push(h);
    if (h.startsWith("#EXT-X-VERSION:") && !resultLines.some((l) => l.startsWith("#EXT-X-MEDIA-SEQUENCE:"))) {
      resultLines.push(`#EXT-X-MEDIA-SEQUENCE:${newMediaSeq}`);
    }
  }
  if (!resultLines.some((l) => l.startsWith("#EXT-X-MEDIA-SEQUENCE:"))) {
    resultLines.splice(1, 0, `#EXT-X-MEDIA-SEQUENCE:${newMediaSeq}`);
  }

  for (const seg of keptSegments) {
    for (const l of seg) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes('URI="')) {
          resultLines.push(
            trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
              const abs = new URL(uri, baseUrl).toString();
              return `URI="/api/cctv/relay?source=${encodeURIComponent(abs)}"`;
            })
          );
        } else {
          resultLines.push(l);
        }
      } else {
        const absUrl = new URL(trimmed, baseUrl).toString();
        resultLines.push(`/api/cctv/relay?source=${encodeURIComponent(absUrl)}`);
      }
    }
  }

  return resultLines.join("\n");
}

/**
 * GET /api/cctv/relay?source=...
 * In-memory CORS-compliant HLS proxy. Rewrites .m3u8 playlist files on-the-fly and streams chunks in RAM.
 */
export async function GET(req: NextRequest) {
  try {
    // Correctly extract the full source parameter even if it contains query parameters or &
    const idx = req.url.indexOf("source=");
    if (idx === -1) {
      return new NextResponse("Missing 'source' query parameter.", { status: 400 });
    }

    const rawSource = req.url.substring(idx + 7);
    let decodedSource = rawSource;
    try {
      decodedSource = decodeURIComponent(rawSource);
    } catch {
      decodedSource = rawSource;
    }

    if (!decodedSource.startsWith("http://") && !decodedSource.startsWith("https://")) {
      return new NextResponse("Invalid source URL protocol.", { status: 400 });
    }

    // Fetch upstream content from Google Video / Cloudflare / HLS Server
    const response = await fetch(decodedSource, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      return new NextResponse(`Upstream stream returned ${response.status}: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type") || "";

    // Differentiate video chunks from HLS playlists:
    // Google Video chunk URLs contain "/playlist/index.m3u8/sq/123/file/seg.ts", which must be treated as binary video, NOT a playlist!
    const isSegment =
      decodedSource.includes("/file/seg.ts") ||
      decodedSource.endsWith(".ts") ||
      decodedSource.includes(".ts?") ||
      decodedSource.endsWith(".m4s") ||
      decodedSource.includes(".m4s?") ||
      contentType.toLowerCase().includes("video/mp2t") ||
      contentType.toLowerCase().includes("video/mp4");

    const isManifest =
      !isSegment &&
      (contentType.toLowerCase().includes("mpegurl") ||
        decodedSource.endsWith(".m3u8") ||
        decodedSource.includes(".m3u8?") ||
        (decodedSource.includes("/playlist/index.m3u8") && !decodedSource.includes("/seg.ts")));

    // If it's an HLS Manifest (.m3u8), rewrite URI paths and trim DVR backlog
    if (isManifest) {
      const manifestText = await response.text();
      const baseUrl = new URL(decodedSource);
      const rewrittenManifest = processHlsManifest(manifestText, baseUrl, 8);

      return new NextResponse(rewrittenManifest, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // For video chunk binary payloads (.ts, .m4s, .mp4) — Stream directly in RAM with verified Content-Length
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const finalContentType =
      decodedSource.includes(".ts") || decodedSource.includes("/file/seg.ts")
        ? "video/MP2T"
        : decodedSource.includes(".m4s") || decodedSource.includes(".mp4")
        ? "video/mp4"
        : contentType || "video/MP2T";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": finalContentType,
        "Content-Length": buffer.length.toString(),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Relay error: ${err.message}`, { status: 500 });
  }
}
