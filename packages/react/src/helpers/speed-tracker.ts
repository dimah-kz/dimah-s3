/**
 * Creates a sliding-window transfer speed calculator.
 *
 * Tracks bytes transferred over a rolling time window to produce a smooth,
 * instantaneous speed reading in bytes/second.
 *
 * @param windowMs  Rolling window duration in milliseconds. @default 3000
 */
export function createSpeedTracker(windowMs = 3000) {
  const samples: Array<{ t: number; loaded: number }> = [];

  return {
    /**
     * Record the latest cumulative `loaded` byte count.
     * Returns the current speed in bytes/second (0 until at least 2 samples exist).
     */
    update(loaded: number): number {
      const now = Date.now();
      samples.push({ t: now, loaded });

      // Prune samples older than the window, but keep at least one anchor.
      const cutoff = now - windowMs;
      while (samples.length > 1 && samples[0].t < cutoff) {
        samples.shift();
      }

      if (samples.length < 2) return 0;

      const oldest = samples[0];
      const newest = samples[samples.length - 1];
      const deltaMs = newest.t - oldest.t;
      const deltaBytes = newest.loaded - oldest.loaded;

      return deltaMs > 0 ? Math.round((deltaBytes / deltaMs) * 1000) : 0;
    },

    reset() {
      samples.length = 0;
    },
  };
}

export type SpeedTracker = ReturnType<typeof createSpeedTracker>;
