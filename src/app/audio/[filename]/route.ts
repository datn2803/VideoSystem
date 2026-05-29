import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/paths";

const AUDIO_DIR = dataPath("audio");

export async function GET(req: NextRequest, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;
  const safe = path.basename(filename);
  const fullPath = path.join(AUDIO_DIR, safe);
  if (!fullPath.startsWith(AUDIO_DIR) || !fs.existsSync(fullPath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const stat = fs.statSync(fullPath);
  const ext = path.extname(safe).toLowerCase();
  const mime = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d+)?/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      const stream = fs.createReadStream(fullPath, { start, end });
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
          "content-length": String(end - start + 1),
          "content-type": mime,
        },
      });
    }
  }
  const buf = fs.readFileSync(fullPath);
  return new NextResponse(buf, {
    headers: {
      "content-type": mime,
      "content-length": String(stat.size),
      "accept-ranges": "bytes",
    },
  });
}
