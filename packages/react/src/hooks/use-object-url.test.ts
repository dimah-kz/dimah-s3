import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  s3Error,
  type DownloadPresignResponse,
  type S3Api,
} from "@dimah-s3/core";
import { useObjectUrl, type UseObjectUrlOptions } from "./use-object-url";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";

const MINUTE = 60_000;

/** Lets pending promises and due timers run, then advances the clock by `ms`. */
async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * A fake api whose presigns return `https://s3.test/<key>?v=<call>`.
 * `expiresIn: null` answers like a proxy route, with no expiry.
 */
function countingApi(expiresIn: number | null = 600) {
  let calls = 0;
  return fakeS3Api({
    download: vi.fn(async (payload): Promise<DownloadPresignResponse> => ({
      key: payload.key,
      bucket: "bucket",
      url: `https://s3.test/${payload.key}?v=${++calls}`,
      disposition: payload.disposition ?? "inline",
      ...(expiresIn === null
        ? { mode: "proxy" as const }
        : { mode: "presign" as const, expiresIn }),
    })),
  });
}

/** Renders the hook with options that tests can change between renders. */
function renderObjectUrl(initial: UseObjectUrlOptions) {
  let options = initial;
  const hook = renderHook(() => useObjectUrl(options));
  return {
    hook,
    rerender(next: Partial<UseObjectUrlOptions>) {
      options = { ...options, ...next };
      hook.rerender();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useObjectUrl", () => {
  it("presigns an inline URL and reports its expiry", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a.png",
    });
    expect(hook.current).toMatchObject({
      objectKey: "a.png",
      url: null,
      isLoading: true,
    });

    await advance();

    expect(api.download).toHaveBeenCalledExactlyOnceWith({
      route: "uploads",
      key: "a.png",
      name: undefined,
      disposition: "inline",
    });
    expect(hook.current).toMatchObject({
      objectKey: "a.png",
      url: "https://s3.test/a.png?v=1",
      expiresAt: Date.now() + 600_000,
      error: null,
      isLoading: false,
    });
    hook.unmount();
  });

  it("passes the file name and disposition", async () => {
    const api = countingApi();
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a.pdf",
      fileName: "Report.pdf",
      disposition: "attachment",
    });
    await advance();

    expect(api.download).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.pdf",
      name: "Report.pdf",
      disposition: "attachment",
    });
    hook.unmount();
  });

  it("does nothing without a key", async () => {
    const api = countingApi();
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "" });
    await advance();

    expect(api.download).not.toHaveBeenCalled();
    expect(hook.current).toMatchObject({
      objectKey: null,
      url: null,
      expiresAt: null,
      isLoading: false,
    });
    hook.unmount();
  });

  it("shares one presign between hooks on the same api", async () => {
    const api = countingApi();
    const first = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    const second = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();

    const third = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();

    expect(api.download).toHaveBeenCalledOnce();
    for (const { hook } of [first, second, third]) {
      expect(hook.current.url).toBe("https://s3.test/a?v=1");
      hook.unmount();
    }
  });

  it("keeps a separate cache per api", async () => {
    const one = countingApi();
    const two = countingApi();
    const first = renderObjectUrl({
      api: one,
      route: "uploads",
      objectKey: "a",
    });
    await advance();
    const second = renderObjectUrl({
      api: two,
      route: "uploads",
      objectKey: "a",
    });
    await advance();

    expect(one.download).toHaveBeenCalledOnce();
    expect(two.download).toHaveBeenCalledOnce();
    first.hook.unmount();
    second.hook.unmount();
  });

  it("never shows the previous key's URL after the key changes", async () => {
    const { promise, resolve } =
      Promise.withResolvers<DownloadPresignResponse>();
    const api = countingApi();
    const { hook, rerender } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
    });
    await advance();
    expect(hook.current.url).toBe("https://s3.test/a?v=1");

    vi.mocked(api.download).mockReturnValueOnce(promise);
    rerender({ objectKey: "b" });
    expect(hook.current).toMatchObject({
      objectKey: "b",
      url: null,
      isLoading: true,
    });

    await advance();
    expect(hook.current.url).toBeNull();

    resolve({
      key: "b",
      bucket: "bucket",
      url: "https://s3.test/b",
      mode: "presign",
      disposition: "inline",
      expiresIn: 600,
    });
    await advance();
    expect(hook.current).toMatchObject({
      objectKey: "b",
      url: "https://s3.test/b",
      isLoading: false,
    });
    hook.unmount();
  });

  it("ignores a late response for a key that is no longer shown", async () => {
    const { promise, resolve } =
      Promise.withResolvers<DownloadPresignResponse>();
    const api = countingApi();
    vi.mocked(api.download).mockReturnValueOnce(promise);
    const { hook, rerender } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
    });
    await advance();

    rerender({ objectKey: "b" });
    await advance();
    expect(hook.current.url).toBe("https://s3.test/b?v=1");

    resolve({
      key: "a",
      bucket: "bucket",
      url: "https://s3.test/a-late",
      mode: "presign",
      disposition: "inline",
      expiresIn: 600,
    });
    await advance();
    expect(hook.current).toMatchObject({
      objectKey: "b",
      url: "https://s3.test/b?v=1",
    });
    hook.unmount();
  });

  it("refreshes refreshBeforeMs before expiry and keeps the URL meanwhile", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
      refreshBeforeMs: MINUTE,
    });
    await advance();

    await advance(9 * MINUTE - 1);
    expect(api.download).toHaveBeenCalledOnce();

    const { promise, resolve } =
      Promise.withResolvers<DownloadPresignResponse>();
    vi.mocked(api.download).mockReturnValueOnce(promise);
    await advance(1);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      isLoading: true,
    });

    resolve({
      key: "a",
      bucket: "bucket",
      url: "https://s3.test/a?v=2",
      mode: "presign",
      disposition: "inline",
      expiresIn: 600,
    });
    await advance();
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=2",
      expiresAt: Date.now() + 600_000,
      isLoading: false,
    });
    hook.unmount();
  });

  it("keeps the URL when a background refresh fails and retries with backoff", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
      refreshBeforeMs: MINUTE,
    });
    await advance();
    const expiresAt = Date.now() + 600_000;

    vi.mocked(api.download)
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockRejectedValueOnce(s3Error("INTERNAL_ERROR"));
    await advance(9 * MINUTE);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      expiresAt,
      error: { code: "NETWORK_ERROR" },
      isLoading: false,
    });

    await advance(999);
    expect(api.download).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(api.download).toHaveBeenCalledTimes(3);
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      error: { code: "INTERNAL_ERROR" },
    });

    await advance(2_000);
    expect(api.download).toHaveBeenCalledTimes(4);
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=2",
      expiresAt: Date.now() + 600_000,
      error: null,
      isLoading: false,
    });
    hook.unmount();
  });

  it("clears the URL once it expires while refreshes keep failing", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
      refreshBeforeMs: MINUTE,
    });
    await advance();

    vi.mocked(api.download).mockRejectedValue(s3Error("NETWORK_ERROR"));
    await advance(10 * MINUTE - 1);
    expect(hook.current.url).toBe("https://s3.test/a?v=1");
    const attempts = vi.mocked(api.download).mock.calls.length;

    await advance(1);
    expect(api.download).toHaveBeenCalledTimes(attempts + 1);
    expect(hook.current).toMatchObject({
      url: null,
      expiresAt: null,
      error: { code: "NETWORK_ERROR" },
      isLoading: false,
    });

    await advance(60 * MINUTE);
    expect(api.download).toHaveBeenCalledTimes(attempts + 1);
    hook.unmount();
  });

  it("keeps the URL until expiry without retrying a non-transient failure", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
      refreshBeforeMs: MINUTE,
    });
    await advance();

    vi.mocked(api.download).mockRejectedValueOnce(s3Error("FORBIDDEN"));
    await advance(9 * MINUTE);
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      error: { code: "FORBIDDEN" },
    });

    await advance(MINUTE - 1);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.url).toBe("https://s3.test/a?v=1");
    await advance(1);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current).toMatchObject({
      url: null,
      error: { code: "FORBIDDEN" },
    });

    act(() => {
      hook.current.refresh();
    });
    await advance();
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=2",
      error: null,
    });
    hook.unmount();
  });

  it("refreshes a short-lived URL at half its lifetime", async () => {
    const api = countingApi(60);
    const { hook } = renderObjectUrl({
      api,
      route: "uploads",
      objectKey: "a",
      refreshBeforeMs: MINUTE,
    });
    await advance();

    await advance(29_999);
    expect(api.download).toHaveBeenCalledOnce();
    await advance(1);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.url).toBe("https://s3.test/a?v=2");
    hook.unmount();
  });

  it("does not reuse a cached URL past its refresh point", async () => {
    const api = countingApi(600);
    const first = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();
    first.hook.unmount();

    await advance(9 * MINUTE);
    const second = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();

    expect(api.download).toHaveBeenCalledTimes(2);
    expect(second.hook.current.url).toBe("https://s3.test/a?v=2");
    second.hook.unmount();
  });

  it("keeps a proxy URL until refresh()", async () => {
    const api = countingApi(null);
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      expiresAt: null,
    });

    await advance(30 * 24 * 60 * MINUTE);
    expect(api.download).toHaveBeenCalledOnce();

    act(() => {
      hook.current.refresh();
    });
    await advance();
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.url).toBe("https://s3.test/a?v=2");
    hook.unmount();
  });

  it("refresh() presigns again despite a fresh cache entry", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();
    const { refresh } = hook.current;

    act(() => {
      refresh();
    });
    expect(hook.current.url).toBe("https://s3.test/a?v=1");
    await advance();

    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.url).toBe("https://s3.test/a?v=2");
    expect(hook.current.refresh).toBe(refresh);
    hook.unmount();
  });

  it("stops refreshing after unmount", async () => {
    const api = countingApi(600);
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();
    hook.unmount();

    await advance(60 * MINUTE);
    expect(api.download).toHaveBeenCalledOnce();
  });

  it("reports presign errors as APIError and clears the URL", async () => {
    const api = fakeS3Api({
      download: vi.fn(async () => {
        throw s3Error("OBJECT_NOT_FOUND");
      }),
    });
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();

    expect(hook.current).toMatchObject({
      url: null,
      expiresAt: null,
      isLoading: false,
    });
    expect(hook.current.error).toBeInstanceOf(APIError);
    expect(hook.current.error?.code).toBe("OBJECT_NOT_FOUND");
    hook.unmount();
  });

  it("turns an unknown failure into UNKNOWN_ERROR and retries on the next load", async () => {
    const api: S3Api = countingApi(600);
    vi.mocked(api.download).mockRejectedValueOnce(new Error("boom"));
    const { hook } = renderObjectUrl({ api, route: "uploads", objectKey: "a" });
    await advance();
    expect(hook.current.error?.code).toBe("UNKNOWN_ERROR");

    act(() => {
      hook.current.refresh();
    });
    await advance();
    expect(hook.current).toMatchObject({
      url: "https://s3.test/a?v=1",
      error: null,
    });
    hook.unmount();
  });

  it("throws without an api when a key is set", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderObjectUrl({ route: "uploads", objectKey: "a" })).toThrow(
      /No S3Api found/,
    );
  });
});
