/** Perceived upload rate. Clamped so small files still show a bar. */
export const UPLOAD_BYTES_PER_SECOND = 5 * 1024 * 1024;
export const UPLOAD_MIN_DURATION_MS = 1_500;
export const UPLOAD_MAX_DURATION_MS = 7_000;
export const UPLOAD_TICK_MS = 50;

/** ~0.9 MB/s so download progress stays on screen. */
export const DOWNLOAD_CHUNK_BYTES = 32_000;
export const DOWNLOAD_CHUNK_DELAY_MS = 36;

export function throttleByteStream(
  totalBytes: number,
  chunkAt: (start: number, size: number) => Uint8Array | Promise<Uint8Array>,
  signal?: AbortSignal,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0;
      try {
        while (sent < totalBytes) {
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const size = Math.min(DOWNLOAD_CHUNK_BYTES, totalBytes - sent);
          controller.enqueue(await chunkAt(sent, size));
          sent += size;
          if (sent < totalBytes) {
            await new Promise((resolve) =>
              setTimeout(resolve, DOWNLOAD_CHUNK_DELAY_MS),
            );
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
