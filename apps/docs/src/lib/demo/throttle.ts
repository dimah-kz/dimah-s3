/** Shared demo transfer pacing — same feel for upload and download. */
export const DEMO_BYTES_PER_SECOND = 5 * 1024 * 1024;
export const DEMO_MIN_DURATION_MS = 1_500;
export const DEMO_MAX_DURATION_MS = 7_000;
export const DEMO_TICK_MS = 50;

export function demoTransferDurationMs(totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(
    DEMO_MAX_DURATION_MS,
    Math.max(DEMO_MIN_DURATION_MS, (totalBytes / DEMO_BYTES_PER_SECOND) * 1000),
  );
}

/** Slow start, faster middle, gentle finish — like a real link warming up. */
export function easeDemoProgress(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function nextTickMs() {
  return DEMO_TICK_MS * (0.7 + Math.random() * 0.6);
}

export async function runTimedDemoTransfer(options: {
  totalBytes: number;
  signal?: AbortSignal;
  onTick: (loaded: number) => void | Promise<void>;
}) {
  const { totalBytes, signal, onTick } = options;

  if (totalBytes <= 0) {
    await onTick(0);
    return;
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const durationMs = demoTransferDurationMs(totalBytes);
  const started = Date.now();

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loaded = 0;
    let settled = false;

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };

    const onAbort = () => {
      finish(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const tick = () => {
      void (async () => {
        if (signal?.aborted) {
          onAbort();
          return;
        }

        const elapsed = Date.now() - started;
        const t = Math.min(1, elapsed / durationMs);
        const target =
          t >= 1
            ? totalBytes
            : Math.min(
                totalBytes - 1,
                Math.max(loaded, Math.round(easeDemoProgress(t) * totalBytes)),
              );

        if (target !== loaded) {
          loaded = target;
          await onTick(loaded);
        }

        if (t >= 1) {
          if (loaded < totalBytes) await onTick(totalBytes);
          finish();
          return;
        }

        timer = setTimeout(tick, nextTickMs());
      })().catch(finish);
    };

    tick();
  });
}

export function throttleByteStream(
  totalBytes: number,
  chunkAt: (start: number, size: number) => Uint8Array | Promise<Uint8Array>,
  signal?: AbortSignal,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0;
      try {
        await runTimedDemoTransfer({
          totalBytes,
          signal,
          onTick: async (loaded) => {
            while (sent < loaded) {
              const size = Math.min(512 * 1024, loaded - sent);
              controller.enqueue(await chunkAt(sent, size));
              sent += size;
            }
          },
        });
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
