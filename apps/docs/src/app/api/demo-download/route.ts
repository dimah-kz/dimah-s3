import { getUploadedObject } from "@/lib/demo/server-object-store";

const MAX_BYTES = 75 * 1024 * 1024;
const CHUNK_BYTES = 64_000;
const CHUNK_DELAY_MS = 28;

export const runtime = "nodejs";

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_");
}

function throttleStream(
  totalBytes: number,
  chunkAt: (start: number, size: number) => Uint8Array,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0;
      while (sent < totalBytes) {
        const size = Math.min(CHUNK_BYTES, totalBytes - sent);
        controller.enqueue(chunkAt(sent, size));
        sent += size;
        if (sent < totalBytes) {
          await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
        }
      }
      controller.close();
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const stored = key ? getUploadedObject(key) : undefined;
  const name = searchParams.get("name") ?? "demo-file.bin";
  const safeName = safeFileName(name);

  if (stored) {
    return new Response(
      throttleStream(stored.body.byteLength, (start, size) =>
        stored.body.subarray(start, start + size),
      ),
      {
        headers: {
          "Content-Type": stored.contentType || "application/octet-stream",
          "Content-Length": String(stored.body.byteLength),
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const requested = Number(searchParams.get("bytes") ?? MAX_BYTES);
  const bytes = Number.isFinite(requested)
    ? Math.min(Math.max(0, Math.floor(requested)), MAX_BYTES)
    : MAX_BYTES;

  return new Response(
    throttleStream(bytes, (_start, size) => new Uint8Array(size)),
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
