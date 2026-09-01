import { act } from "react";
import { describe, expect, it, vi } from "vitest";
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
});
