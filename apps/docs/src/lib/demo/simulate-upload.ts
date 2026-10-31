import type { UploadTransport } from "@dimah-s3/react/engine";
import { runTimedDemoTransfer } from "@/lib/demo/throttle";

/**
 * In-browser upload progress. Docs demos must not PUT file bytes through a
 * Vercel Function — the platform rejects bodies around 4.5 MB with 413.
 */
export const simulateDemoUpload: UploadTransport = async (
  file,
  _presign,
  { onProgress, signal },
) => {
  const total = file.size;

  try {
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
  } catch (error) {
    // Reject with the caller's abort reason, as a real transfer does.
    signal?.throwIfAborted();
    throw error;
  }
};
