import { throttleByteStream } from "@/lib/demo/throttle";

const MAX_BYTES = 75 * 1024 * 1024;

export const runtime = "nodejs";

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? "demo-file.bin";
  const safeName = safeFileName(name);
  const requested = Number(searchParams.get("bytes") ?? MAX_BYTES);
  const bytes = Number.isFinite(requested)
    ? Math.min(Math.max(0, Math.floor(requested)), MAX_BYTES)
    : MAX_BYTES;

  return new Response(
    throttleByteStream(bytes, (_start, size) => new Uint8Array(size)),
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
