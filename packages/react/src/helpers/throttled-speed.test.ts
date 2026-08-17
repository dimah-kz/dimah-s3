import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpeedTracker } from "./speed-tracker";
import { createThrottledSpeedUpdater } from "./throttled-speed";

describe("createThrottledSpeedUpdater", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits speed until a sample is available", () => {
    const updater = createThrottledSpeedUpdater(createSpeedTracker(), 500);
    expect(updater.apply({ loaded: 0, total: 100, percent: 0 })).toEqual({
      loaded: 0,
      total: 100,
      percent: 0,
    });
  });

  it("throttles speed updates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const updater = createThrottledSpeedUpdater(createSpeedTracker(1000), 500);

    updater.apply({ loaded: 0, total: 10_000, percent: 0 });
    vi.setSystemTime(500);
    const first = updater.apply({ loaded: 1000, total: 10_000, percent: 10 });
    expect(first.speed).toBeGreaterThan(0);

    vi.setSystemTime(600);
    const held = updater.apply({ loaded: 9000, total: 10_000, percent: 90 });
    expect(held.speed).toBe(first.speed);
  });

  it("reset clears the last published speed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const updater = createThrottledSpeedUpdater(createSpeedTracker(1000), 10);
    updater.apply({ loaded: 0, total: 100, percent: 0 });
    vi.setSystemTime(20);
    updater.apply({ loaded: 50, total: 100, percent: 50 });
    updater.reset();
    expect(
      updater.apply({ loaded: 0, total: 100, percent: 0 }).speed,
    ).toBeUndefined();
  });
});
