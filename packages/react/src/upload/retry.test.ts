import { afterEach, describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import { URL_EXPIRY_MARGIN_MS } from "./constants";
import { isRetryableError, withPresignedRetry, withRetry } from "./retry";

const fast = { retry: { maxRetries: 3, baseDelay: 1 } };

function uploadFailed(status: number) {
  return s3Error("UPLOAD_FAILED", { status }, { status });
}

/** How a custom transport may build the error: the catalog status, 502. */
function transportFailed(status: number) {
  return s3Error("UPLOAD_FAILED", { status });
}

describe("isRetryableError", () => {
  it.each([
    ["NETWORK_ERROR", s3Error("NETWORK_ERROR"), true],
    [
      "S3_NETWORK_ERROR",
      s3Error("S3_NETWORK_ERROR", { code: "ECONNRESET" }),
      true,
    ],
    ["UPLOAD_FAILED 503", uploadFailed(503), true],
    ["UPLOAD_FAILED 429", uploadFailed(429), true],
    ["UPLOAD_FAILED 403", uploadFailed(403), false],
    [
      "UPLOAD_FAILED 403 without the status option",
      transportFailed(403),
      false,
    ],
    [
      "UPLOAD_FAILED 400 without the status option",
      transportFailed(400),
      false,
    ],
    ["UPLOAD_FAILED 503 without the status option", transportFailed(503), true],
    ["INTERNAL_ERROR", s3Error("INTERNAL_ERROR"), false],
    [
      "FILE_TOO_LARGE",
      s3Error("FILE_TOO_LARGE", { size: 2, maxFileSize: 1 }),
      false,
    ],
    ["a plain Error", new Error("boom"), false],
    ["an AbortError", new DOMException("cancel", "AbortError"), false],
  ])("%s → %s", (_, error, expected) => {
    expect(isRetryableError(error)).toBe(expected);
  });
});

describe("withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns on the first success", async () => {
    await expect(withRetry(async () => "ok", fast)).resolves.toBe("ok");
  });

  it("retries a retryable failure with exponential backoff", async () => {
    vi.useFakeTimers();
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockRejectedValueOnce(uploadFailed(500))
      .mockResolvedValue("ok");

    const pending = withRetry(task, { retry: { baseDelay: 100 } });
    await vi.advanceTimersByTimeAsync(99);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries", async () => {
    const task = vi.fn(async () => {
      throw s3Error("NETWORK_ERROR");
    });
    await expect(
      withRetry(task, { retry: { maxRetries: 2, baseDelay: 1 } }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const task = vi.fn(async () => {
      throw s3Error("UPLOAD_TICKET_INVALID");
    });
    await expect(withRetry(task, fast)).rejects.toMatchObject({
      code: "UPLOAD_TICKET_INVALID",
    });
    expect(task).toHaveBeenCalledOnce();
  });

  it("rejects with the abort reason when aborted during backoff", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new DOMException("cancel", "AbortError");
    const task = vi.fn(async () => {
      throw s3Error("NETWORK_ERROR");
    });

    const pending = withRetry(task, {
      retry: { baseDelay: 10_000 },
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(task).toHaveBeenCalledOnce();
  });

  it("prefers the abort reason over the task's error", async () => {
    const controller = new AbortController();
    const reason = new DOMException("detach", "AbortError");
    const pending = withRetry(
      async () => {
        controller.abort(reason);
        throw s3Error("NETWORK_ERROR");
      },
      { ...fast, signal: controller.signal },
    );
    await expect(pending).rejects.toBe(reason);
  });
});

describe("withPresignedRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function signer() {
    let count = 0;
    return vi.fn(async () => ({ url: `url-${++count}`, expiresIn: 600 }));
  }

  it("re-signs once when a 403 comes from an expired URL", async () => {
    vi.useFakeTimers();
    const sign = signer();
    const send = vi.fn(async ({ url }: { url: string }) => {
      if (url === "url-1") {
        vi.setSystemTime(Date.now() + 600_000);
        throw uploadFailed(403);
      }
    });

    const pending = withPresignedRetry(sign, send, fast);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ url: "url-2", expiresIn: 600 });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([signed]) => signed.url)).toEqual([
      "url-1",
      "url-2",
    ]);
  });

  it("re-signs an expired-URL 403 from a transport without the status option", async () => {
    vi.useFakeTimers();
    const sign = signer();
    const send = vi.fn(async ({ url }: { url: string }) => {
      if (url === "url-1") {
        vi.setSystemTime(Date.now() + 600_000);
        throw transportFailed(403);
      }
    });

    const pending = withPresignedRetry(sign, send, fast);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ url: "url-2" });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 403 while the URL is still valid", async () => {
    const sign = signer();
    const send = vi.fn(async () => {
      throw uploadFailed(403);
    });

    await expect(withPresignedRetry(sign, send, fast)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      statusCode: 403,
    });
    expect(sign).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("reuses a live URL after a network error", async () => {
    const sign = signer();
    const send = vi
      .fn<(signed: { url: string }) => Promise<void>>()
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockResolvedValue(undefined);

    await withPresignedRetry(sign, send, fast);

    expect(sign).toHaveBeenCalledOnce();
    expect(send.mock.calls.map(([signed]) => signed.url)).toEqual([
      "url-1",
      "url-1",
    ]);
  });

  it("signs again before a retry once the URL is about to expire", async () => {
    vi.useFakeTimers();
    const sign = signer();
    const send = vi.fn(async ({ url }: { url: string }) => {
      if (url === "url-1") {
        vi.setSystemTime(Date.now() + 600_000 - URL_EXPIRY_MARGIN_MS);
        throw s3Error("NETWORK_ERROR");
      }
    });

    const pending = withPresignedRetry(sign, send, fast);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ url: "url-2" });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("retries a failed signing request", async () => {
    const sign = vi
      .fn<() => Promise<{ url: string; expiresIn: number }>>()
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockResolvedValue({ url: "url-1", expiresIn: 600 });
    const send = vi.fn(async () => {});

    await withPresignedRetry(sign, send, fast);

    expect(sign).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
  });
});
