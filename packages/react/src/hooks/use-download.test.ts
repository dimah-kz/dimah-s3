import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DownloadPresignResponse } from "@dimah-s3/core";
import { isFetchDownload, useDownload } from "./use-download";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";

describe("useDownload", () => {
  it("presigns and stores the url", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));

    let result: { url: string; expiresIn: number } | null = null;
    await act(async () => {
      result = await hook.current.presign("a.png", "save.png");
    });

    expect(api.download).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
      fileName: "save.png",
    });
    expect(result).toEqual({ url: "https://s3.test/dl", expiresIn: 600 });
    expect(hook.current).toMatchObject({
      phase: "idle",
      mode: "navigate",
      objectKey: "a.png",
      url: "https://s3.test/dl",
      error: null,
      isPending: false,
    });
    hook.unmount();
  });

  it("records API failures", async () => {
    const api = fakeS3Api({
      download: vi.fn(async () => {
        throw new Error("blocked");
      }),
    });
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.presign("missing.png");
    });

    expect(hook.current).toMatchObject({
      phase: "error",
      objectKey: "missing.png",
      error: expect.objectContaining({ message: "blocked" }),
      url: null,
    });
    hook.unmount();
  });

  it("fetch mode exposes progress and cancel", () => {
    const hook = renderHook(() =>
      useDownload({ api: fakeS3Api(), route: "uploads", mode: "fetch" }),
    );
    expect(hook.current.progress).toEqual({
      loaded: 0,
      total: 0,
      percent: 0,
    });
    expect(hook.current.mode).toBe("fetch");
    expect(hook.current.objectKey).toBeNull();
    expect(hook.current.isPending).toBe(false);
    expect(hook.current.isDownloading).toBe(false);
    expect(typeof hook.current.cancel).toBe("function");
    expect(isFetchDownload(hook.current)).toBe(true);
    hook.unmount();
  });

  it("defaults to navigate mode", () => {
    const hook = renderHook(() =>
      useDownload({ api: fakeS3Api(), route: "uploads" }),
    );
    expect(hook.current.mode).toBe("navigate");
    expect(hook.current.objectKey).toBeNull();
    expect(isFetchDownload(hook.current)).toBe(false);
    hook.unmount();
  });

  it("keeps the latest navigate presign when two overlap", async () => {
    let releaseFirst!: (value: {
      bucket: string;
      key: string;
      url: string;
      expiresIn: number;
    }) => void;
    const api = fakeS3Api({
      download: vi.fn(async (payload) => {
        if (payload.key === "a.png") {
          return new Promise<DownloadPresignResponse>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return {
          bucket: "bucket",
          key: payload.key,
          url: "https://s3.test/b",
          expiresIn: 600,
        };
      }),
    });
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));

    let first: Promise<{ url: string; expiresIn: number } | null> =
      Promise.resolve(null);
    await act(async () => {
      first = hook.current.presign("a.png");
    });
    await act(async () => {
      await hook.current.presign("b.png");
    });
    expect(hook.current).toMatchObject({
      objectKey: "b.png",
      url: "https://s3.test/b",
    });

    await act(async () => {
      releaseFirst({
        bucket: "bucket",
        key: "a.png",
        url: "https://s3.test/a",
        expiresIn: 600,
      });
      await first;
    });
    expect(hook.current).toMatchObject({
      objectKey: "b.png",
      url: "https://s3.test/b",
    });
    hook.unmount();
  });

  it("presigns many files without changing single-file state", async () => {
    const api = fakeS3Api({
      download: vi.fn(async (payload) => ({
        bucket: "bucket",
        key: payload.key,
        url: `https://s3.test/${payload.key}`,
        expiresIn: 600,
      })),
    });
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));

    let signed: { key: string; url: string; expiresIn: number }[] = [];
    await act(async () => {
      const result = await hook.current.presignMany([
        { key: "a.png", fileName: "A.png", expiresIn: 900 },
        { key: "b.png" },
      ]);
      signed = result.signed;
      expect(result.failed).toEqual([]);
    });

    expect(api.download).toHaveBeenCalledTimes(2);
    expect(api.download).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
      fileName: "A.png",
      expiresIn: 900,
    });
    expect(signed).toEqual([
      { key: "a.png", url: "https://s3.test/a.png", expiresIn: 600 },
      { key: "b.png", url: "https://s3.test/b.png", expiresIn: 600 },
    ]);
    expect(hook.current).toMatchObject({
      phase: "idle",
      objectKey: null,
      url: null,
      isPending: false,
    });
    hook.unmount();
  });

  it("keeps going when one presignMany key fails or is blocked", async () => {
    const api = fakeS3Api({
      download: vi.fn(async (payload) => {
        if (payload.key === "bad.png") throw new Error("nope");
        return {
          bucket: "bucket",
          key: payload.key,
          url: "https://s3.test/ok",
          expiresIn: 600,
        };
      }),
    });
    const onError = vi.fn();
    const hook = renderHook(() =>
      useDownload({
        api,
        route: "uploads",
        onError,
        beforeDownload: async (key) => key !== "skip.png",
      }),
    );

    await act(async () => {
      const result = await hook.current.presignMany([
        { key: "skip.png" },
        { key: "bad.png" },
        { key: "ok.png" },
      ]);
      expect(result.failed).toEqual(["skip.png", "bad.png"]);
      expect(result.signed).toEqual([
        { key: "ok.png", url: "https://s3.test/ok", expiresIn: 600 },
      ]);
    });

    expect(api.download).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith("skip.png", expect.any(Error));
    expect(onError).toHaveBeenCalledWith("bad.png", expect.any(Error));
    expect(hook.current.phase).toBe("idle");
    expect(hook.current.objectKey).toBeNull();
    hook.unmount();
  });

  it("forwards expiresIn on presign", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.presign("a.png", "save.png", 900);
    });

    expect(api.download).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
      fileName: "save.png",
      expiresIn: 900,
    });
    hook.unmount();
  });
});
