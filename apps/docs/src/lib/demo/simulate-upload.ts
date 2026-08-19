import type { UploadPresignResponse } from "@dimah-s3/core";
import {
  UPLOAD_BYTES_PER_SECOND,
  UPLOAD_MAX_DURATION_MS,
  UPLOAD_MIN_DURATION_MS,
  UPLOAD_TICK_MS,
} from "@/lib/demo/throttle";

/**
 * In-browser upload progress. Docs demos must not PUT file bytes through a
 * Vercel Function — the platform rejects bodies around 4.5 MB with 413.
 */
export async function simulateDemoUpload(
  file: File,
  _presign: UploadPresignResponse,
  {
    onProgress,
    signal,
  }: {
    onProgress?: (progress: {
      loaded: number;
      total: number;
      percent: number;
    }) => void;
    signal?: AbortSignal;
  },
) {
  const total = file.size;
  const durationMs = Math.min(
    UPLOAD_MAX_DURATION_MS,
    Math.max(UPLOAD_MIN_DURATION_MS, (total / UPLOAD_BYTES_PER_SECOND) * 1000),
  );

  if (signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const started = Date.now();

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (error?: unknown) => {
      if (timer != null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };

    const onAbort = () => {
      finish(new DOMException("Upload aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const tick = () => {
      const ratio = Math.min(1, (Date.now() - started) / durationMs);
      onProgress?.({
        loaded: Math.round(total * ratio),
        total,
        percent: Math.round(ratio * 100),
      });
      if (ratio >= 1) {
        finish();
        return;
      }
      timer = setTimeout(tick, UPLOAD_TICK_MS);
    };

    tick();
  });
}
