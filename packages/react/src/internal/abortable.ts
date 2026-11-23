/**
 * Settles like `promise`, or rejects with `signal.reason` when the signal
 * aborts first. Use it for work that does not take a signal itself, such as
 * a consumer callback. Once aborted, a later rejection of `promise` is ignored.
 */
export async function abortable<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  const work = Promise.resolve(promise);
  if (!signal) return work;

  if (!signal.aborted) {
    const { promise: aborted, resolve } = Promise.withResolvers<void>();
    const onAbort = () => resolve();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await Promise.race([work, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  if (signal.aborted) work.catch(ignore);
  signal.throwIfAborted();
  return work;
}

/** Resolves after `ms`, or rejects with `signal.reason` when the signal aborts first. */
export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();

  const { promise, resolve } = Promise.withResolvers<void>();
  const timer = setTimeout(resolve, ms);
  const onAbort = () => {
    clearTimeout(timer);
    resolve();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await promise;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  signal?.throwIfAborted();
}

function ignore() {}
