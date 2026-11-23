/**
 * How many tasks may run at once: `value` as a whole number of at least 1,
 * or `fallback` when it is unset or not a number.
 */
export function concurrencyLimit(
  value: number | undefined,
  fallback: number,
): number {
  const limit = Math.floor(value ?? fallback);
  return Number.isNaN(limit) ? fallback : Math.max(1, limit);
}

/**
 * Runs `task` for every item with at most `concurrency` tasks at once.
 * Results keep the order of `items`. The first rejection rejects the whole
 * run, and no new task starts after it; tasks already running are not
 * stopped, so pass them a signal to cancel them.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function worker() {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workers = Math.min(concurrencyLimit(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
