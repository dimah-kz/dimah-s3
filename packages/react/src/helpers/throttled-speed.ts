import type { UploadProgress } from "../types";
import type { SpeedTracker } from "./speed-tracker";

/** Throttle speed samples so UI updates stay readable. */
export function createThrottledSpeedUpdater(
  tracker: SpeedTracker,
  intervalMs = 500,
) {
  let lastSpeed: number | undefined;
  let lastUpdate = 0;

  return {
    reset() {
      tracker.reset();
      lastSpeed = undefined;
      lastUpdate = 0;
    },
    apply(progress: UploadProgress): UploadProgress {
      const rawSpeed = tracker.update(progress.loaded);
      const now = Date.now();
      if (rawSpeed > 0 && now - lastUpdate >= intervalMs) {
        lastSpeed = rawSpeed;
        lastUpdate = now;
      }
      return lastSpeed ? { ...progress, speed: lastSpeed } : progress;
    },
  };
}
