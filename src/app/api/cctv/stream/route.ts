import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".ogg", ".m4v"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const camId = searchParams.get("cam") || "cam-04";

    const camDir = path.join(process.cwd(), "public", "cctv", camId);
    if (!fs.existsSync(camDir)) {
      return new NextResponse("Camera folder not found", { status: 404 });
    }

    const files = fs.readdirSync(camDir);
    const videoFile = files.find((f) =>
      VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );

    if (!videoFile) {
      return new NextResponse("Video file not found", { status: 404 });
    }

    const videoPath = path.join(camDir, videoFile);
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;

    const range = req.headers.get("range");

    if (range) {
      // Parse Range Header e.g. "bytes=0-100000"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse("Requested range not satisfiable", {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(videoPath, { start, end });
      fileStream.on("error", () => {});
      req.signal.addEventListener("abort", () => {
        try { fileStream.destroy(); } catch (_) {}
      });

      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => {
            try {
              controller.enqueue(chunk);
            } catch (_) {
              try { fileStream.destroy(); } catch (e) {}
            }
          });
          fileStream.on("end", () => {
            try { controller.close(); } catch (_) {}
          });
          fileStream.on("error", (err) => {
            try { controller.error(err); } catch (_) {}
          });
        },
        cancel() {
          try { fileStream.destroy(); } catch (_) {}
        },
      });

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunksize),
          "Content-Type": "video/mp4",
          "Content-Disposition": "inline",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } else {
      // Full content
      const fileStream = fs.createReadStream(videoPath);
      fileStream.on("error", () => {});
      req.signal.addEventListener("abort", () => {
        try { fileStream.destroy(); } catch (_) {}
      });

      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => {
            try {
              controller.enqueue(chunk);
            } catch (_) {
              try { fileStream.destroy(); } catch (e) {}
            }
          });
          fileStream.on("end", () => {
            try { controller.close(); } catch (_) {}
          });
          fileStream.on("error", (err) => {
            try { controller.error(err); } catch (_) {}
          });
        },
        cancel() {
          try { fileStream.destroy(); } catch (_) {}
        },
      });

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Content-Type": "video/mp4",
          "Content-Disposition": "inline",
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch (err: any) {
    return new NextResponse(`Streaming error: ${err.message}`, { status: 500 });
  }
}
