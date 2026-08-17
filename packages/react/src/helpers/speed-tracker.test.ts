import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpeedTracker } from "./speed-tracker";

describe("createSpeedTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 until two samples exist", () => {
    const tracker = createSpeedTracker();
    expect(tracker.update(0)).toBe(0);
  });

  it("computes bytes/sec over the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const tracker = createSpeedTracker(1000);

    expect(tracker.update(0)).toBe(0);
    vi.setSystemTime(500);
    expect(tracker.update(1000)).toBe(2000);
  });

  it("reset clears samples", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const tracker = createSpeedTracker();
    tracker.update(0);
    vi.setSystemTime(100);
    tracker.update(100);
    tracker.reset();
    expect(tracker.update(200)).toBe(0);
  });
});
