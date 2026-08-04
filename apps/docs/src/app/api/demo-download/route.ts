const MAX_BYTES = 50_000_000;
const CHUNK_BYTES = 64_000;
const CHUNK_DELAY_MS = 28;

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("bytes") ?? 40_000_000);
  const bytes = Number.isFinite(requested)
    ? Math.min(Math.max(0, Math.floor(requested)), MAX_BYTES)
    : 40_000_000;
  const name = searchParams.get("name") ?? "demo-file.bin";
  const safeName = name.replace(/[^\w.\-() ]+/g, "_");

  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      while (sent < bytes) {
        const size = Math.min(CHUNK_BYTES, bytes - sent);
        controller.enqueue(new Uint8Array(size));
        sent += size;
        if (sent < bytes) {
          await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
