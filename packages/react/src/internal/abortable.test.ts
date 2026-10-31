import { afterEach, describe, expect, it, vi } from "vitest";
import { abortable, delay } from "./abortable";

afterEach(() => {
  vi.useRealTimers();
});

describe("abortable", () => {
  it("settles like the promise when the signal does not abort", async () => {
    const controller = new AbortController();
    await expect(
      abortable(Promise.resolve(1), controller.signal),
    ).resolves.toBe(1);
    const error = new Error("boom");
    await expect(
      abortable(Promise.reject(error), controller.signal),
    ).rejects.toBe(error);
    await expect(abortable(Promise.resolve(2), undefined)).resolves.toBe(2);
  });

  it("rejects with the abort reason when the signal aborts first", async () => {
    const controller = new AbortController();
    const reason = new DOMException("cancel", "AbortError");
    const work = Promise.withResolvers<number>();

    const result = abortable(work.promise, controller.signal);
    controller.abort(reason);
    work.reject(new Error("late"));

    await expect(result).rejects.toBe(reason);
  });

  it("rejects at once for an aborted signal", async () => {
    const reason = new DOMException("detach", "AbortError");
    await expect(
      abortable(Promise.resolve(1), AbortSignal.abort(reason)),
    ).rejects.toBe(reason);
  });
});

describe("delay", () => {
  it("resolves after the given time", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void delay(1000).then(done);

    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("rejects with the abort reason and clears the timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new DOMException("cancel", "AbortError");

    const result = delay(1000, controller.signal);
    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
    await expect(delay(10, controller.signal)).rejects.toBe(reason);
  });
});
