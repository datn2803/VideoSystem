import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/paths";

const UPLOADS_DIR = dataPath("uploads");

export async function GET(req: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;
  // Sanitize — only allow safe basename
  const safe = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safe);
  if (!fullPath.startsWith(UPLOADS_DIR) || !fs.existsSync(fullPath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const stat = fs.statSync(fullPath);
  const ext = path.extname(safe).toLowerCase();
  const mime: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".m4v": "video/mp4",
  };

  // Support range requests for video seeking
  const range = req.headers.get("range");
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d+)?/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(fullPath, { start, end });
      // Node Readable → Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
      });
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "content-range": `bytes ${start}-${end}/${stat.size}`,
          "accept-ranges": "bytes",
          "content-length": String(chunkSize),
          "content-type": mime[ext] || "application/octet-stream",
        },
      });
    }
  }

  const buf = fs.readFileSync(fullPath);
  return new NextResponse(buf, {
    headers: {
      "content-type": mime[ext] || "application/octet-stream",
      "content-length": String(stat.size),
      "accept-ranges": "bytes",
    },
  });
}
