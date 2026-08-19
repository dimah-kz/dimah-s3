import type { UploadPresignResponse } from "@dimah-s3/core";
import { runTimedDemoTransfer } from "@/lib/demo/throttle";

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

  await runTimedDemoTransfer({
    totalBytes: total,
    signal,
    onTick: (loaded) => {
      onProgress?.({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : 100,
      });
    },
  });
}
