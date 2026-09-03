import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns on the first success", async () => {
    await expect(
      withRetry(async () => "ok", { maxRetries: 2, baseDelay: 1 }),
    ).resolves.toBe("ok");
  });

  it("retries failed attempts with backoff", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const pending = withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("fail");
        return "ok";
      },
      { maxRetries: 3, baseDelay: 10 },
    );

    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry AbortError", async () => {
    const fn = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 1 }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("stops waiting when aborted during backoff", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error("fail");
    });
    const pending = withRetry(
      fn,
      { maxRetries: 2, baseDelay: 10_000 },
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fn).toHaveBeenCalledOnce();
  });
});
