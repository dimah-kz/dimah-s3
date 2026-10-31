import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  s3Error,
  type DownloadPayload,
  type DownloadPresignResponse,
  type S3RequestOptions,
} from "@dimah-s3/core";
import { abortable } from "@/internal/abortable";
import type * as browserDownload from "@/internal/browser-download";
import { startBrowserDownload } from "@/internal/browser-download";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import type { DownloadOutcome } from "@/types/download";
import { useDownload } from "./use-download";

vi.mock("@/internal/browser-download", async (importOriginal) => ({
  ...(await importOriginal<typeof browserDownload>()),
  startBrowserDownload: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function signed(key: string): DownloadPresignResponse {
  return {
    key,
    bucket: "bucket",
    url: `https://s3.test/dl/${key}`,
    mode: "presign",
    disposition: "attachment",
    expiresIn: 600,
  };
}

/** A `download` that settles only by rejecting with the abort reason. */
function downloadUntilAborted() {
  return vi.fn((_payload: DownloadPayload, options?: S3RequestOptions) =>
    abortable(new Promise<DownloadPresignResponse>(() => {}), options?.signal),
  );
}

describe("useDownload", () => {
  it("presigns, hands the URL to the browser and records the operation", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useDownload({
        api,
        route: "uploads",
        disposition: "attachment",
        onSuccess,
        onSettled,
      }),
    );

    let outcome: DownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.png", { fileName: "A.png" });
    });

    const data = signed("a.png");
    expect(api.download).toHaveBeenCalledWith(
      {
        route: "uploads",
        key: "a.png",
        name: "A.png",
        disposition: "attachment",
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(startBrowserDownload).toHaveBeenCalledWith(data.url);
    expect(outcome).toEqual({ status: "success", key: "a.png", data });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(data, "a.png");
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(hook.current.operations).toEqual([
      {
        id: expect.any(String),
        key: "a.png",
        fileName: "A.png",
        phase: "success",
        error: null,
        result: data,
      },
    ]);
    expect(hook.current.get("a.png")?.phase).toBe("success");
    expect(hook.current).toMatchObject({
      mode: "navigate",
      instanceId: expect.any(String),
      pendingKeys: [],
      isPending: false,
    });
    hook.unmount();
  });

  it("runs keys in parallel and joins a repeated key", async () => {
    const pending = new Map<
      string,
      PromiseWithResolvers<DownloadPresignResponse>
    >();
    const api = fakeS3Api({
      download: vi.fn((payload: DownloadPayload) => {
        const deferred = Promise.withResolvers<DownloadPresignResponse>();
        pending.set(payload.key, deferred);
        return deferred.promise;
      }),
    });
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useDownload({ api, route: "uploads", onSuccess, onSettled }),
    );

    let first!: Promise<DownloadOutcome>;
    let again!: Promise<DownloadOutcome>;
    await act(async () => {
      first = hook.current.download("a.png");
      void hook.current.download("b.png");
      again = hook.current.download("a.png", { fileName: "other.png" });
    });

    expect(again).toBe(first);
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.pendingKeys).toEqual(["a.png", "b.png"]);
    expect(hook.current.isPending).toBe(true);
    expect(hook.current.operations.map((op) => [op.key, op.phase])).toEqual([
      ["a.png", "presigning"],
      ["b.png", "presigning"],
    ]);

    await act(async () => {
      pending.get("a.png")?.resolve(signed("a.png"));
      pending.get("b.png")?.resolve(signed("b.png"));
      await first;
    });

    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(hook.current.isPending).toBe(false);
    hook.unmount();
  });

  it("blocks without an operation when beforeDownload returns false", async () => {
    const api = fakeS3Api();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useDownload({
        api,
        route: "uploads",
        beforeDownload: () => false,
        onError,
        onSettled,
      }),
    );

    let outcome: DownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.png");
    });

    expect(outcome).toEqual({ status: "blocked", key: "a.png" });
    expect(api.download).not.toHaveBeenCalled();
    expect(hook.current.operations).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(outcome);
    hook.unmount();
  });

  it("fails with HOOK_FAILED when beforeDownload throws", async () => {
    const api = fakeS3Api();
    const onError = vi.fn();
    const hook = renderHook(() =>
      useDownload({
        api,
        route: "uploads",
        beforeDownload: () => {
          throw new Error("boom");
        },
        onError,
      }),
    );

    await act(async () => {
      await hook.current.download("a.png");
    });

    const operation = hook.current.get("a.png");
    expect(operation?.phase).toBe("error");
    expect(operation?.error?.code).toBe("HOOK_FAILED");
    expect(onError).toHaveBeenCalledExactlyOnceWith(operation?.error, "a.png");
    expect(api.download).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("records API errors with their catalog code", async () => {
    const api = fakeS3Api({
      download: vi.fn(async () => {
        throw s3Error("OBJECT_NOT_FOUND");
      }),
    });
    const onError = vi.fn();
    const hook = renderHook(() =>
      useDownload({ api, route: "uploads", onError }),
    );

    let outcome: DownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("missing.png");
    });

    expect(outcome).toMatchObject({
      status: "error",
      key: "missing.png",
      error: { code: "OBJECT_NOT_FOUND" },
    });
    expect(hook.current.get("missing.png")).toMatchObject({
      phase: "error",
      error: { code: "OBJECT_NOT_FOUND" },
      result: null,
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "OBJECT_NOT_FOUND" }),
      "missing.png",
    );
    expect(startBrowserDownload).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("lets onError download the same key again", async () => {
    const api = fakeS3Api({
      download: vi
        .fn()
        .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
        .mockResolvedValueOnce(signed("a.png")),
    });
    let retry: Promise<DownloadOutcome> | undefined;
    const hook = renderHook(() =>
      useDownload({
        api,
        route: "uploads",
        onError: (_error, key) => {
          retry = hook.current.download(key);
        },
      }),
    );

    let outcome: DownloadOutcome | undefined;
    let retried: DownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.png");
      retried = await retry;
    });

    expect(outcome).toMatchObject({ status: "error", key: "a.png" });
    expect(retried).toEqual({
      status: "success",
      key: "a.png",
      data: signed("a.png"),
    });
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(hook.current.pendingKeys).toEqual([]);
    expect(hook.current.get("a.png")?.phase).toBe("success");
    hook.unmount();
  });

  it("aborts the presign on cancel(key)", async () => {
    const api = fakeS3Api({ download: downloadUntilAborted() });
    const onError = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useDownload({ api, route: "uploads", onError, onSettled }),
    );

    let pending!: Promise<DownloadOutcome>;
    await act(async () => {
      pending = hook.current.download("a.png");
    });
    let outcome: DownloadOutcome | undefined;
    await act(async () => {
      hook.current.cancel("a.png");
      outcome = await pending;
    });

    expect(outcome).toEqual({ status: "aborted", key: "a.png" });
    expect(hook.current.get("a.png")?.phase).toBe("aborted");
    expect(startBrowserDownload).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(outcome);
    hook.unmount();
  });

  it("resets settled operations with a stable reset", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useDownload({ api, route: "uploads" }));
    const { reset } = hook.current;

    await act(async () => {
      await hook.current.download("a.png");
      await hook.current.download("b.png");
    });
    act(() => hook.current.reset("a.png"));

    expect(hook.current.reset).toBe(reset);
    expect(hook.current.operations.map((op) => op.key)).toEqual(["b.png"]);

    act(() => hook.current.reset());
    expect(hook.current.operations).toEqual([]);
    hook.unmount();
  });

  it("reports a throwing after-callback without changing the outcome", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const failure = new Error("callback");
    const hook = renderHook(() =>
      useDownload({
        api: fakeS3Api(),
        route: "uploads",
        onSuccess: () => {
          throw failure;
        },
      }),
    );

    let outcome: DownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.png");
    });

    expect(outcome?.status).toBe("success");
    expect(report).toHaveBeenCalledWith(failure);
    hook.unmount();
  });

  it("rejects when no S3Api is available", async () => {
    const hook = renderHook(() => useDownload({ route: "uploads" }));

    await act(async () => {
      await expect(hook.current.download("a.png")).rejects.toThrow(
        /No S3Api found/,
      );
    });
    hook.unmount();
  });

  describe("presign", () => {
    it("signs without recording an operation or running result callbacks", async () => {
      const api = fakeS3Api();
      const beforeDownload = vi.fn(() => true);
      const onSuccess = vi.fn();
      const onSettled = vi.fn();
      const hook = renderHook(() =>
        useDownload({
          api,
          route: "uploads",
          beforeDownload,
          onSuccess,
          onSettled,
        }),
      );

      let outcome: DownloadOutcome | undefined;
      await act(async () => {
        outcome = await hook.current.presign("a.png", {
          fileName: "A.png",
          expiresIn: 900,
        });
      });

      expect(api.download).toHaveBeenCalledWith(
        { route: "uploads", key: "a.png", name: "A.png", expiresIn: 900 },
        { signal: undefined },
      );
      expect(outcome).toEqual({
        status: "success",
        key: "a.png",
        data: { ...signed("a.png"), expiresIn: 900 },
      });
      expect(beforeDownload).toHaveBeenCalledExactlyOnceWith("a.png");
      expect(startBrowserDownload).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onSettled).not.toHaveBeenCalled();
      expect(hook.current.operations).toEqual([]);
      hook.unmount();
    });

    it("returns blocked and error outcomes", async () => {
      const api = fakeS3Api({
        download: vi.fn(async () => {
          throw new Error("offline");
        }),
      });
      const hook = renderHook(() =>
        useDownload({
          api,
          route: "uploads",
          beforeDownload: (key) => key !== "skip.png",
        }),
      );

      let blocked: DownloadOutcome | undefined;
      let failed: DownloadOutcome | undefined;
      await act(async () => {
        blocked = await hook.current.presign("skip.png");
        failed = await hook.current.presign("a.png");
      });

      expect(blocked).toEqual({ status: "blocked", key: "skip.png" });
      expect(failed).toMatchObject({
        status: "error",
        key: "a.png",
        error: { code: "UNKNOWN_ERROR" },
      });
      hook.unmount();
    });
  });

  describe("presignMany", () => {
    it("sorts keys into signed, failed and blocked", async () => {
      const api = fakeS3Api({
        download: vi.fn(async (payload: DownloadPayload) => {
          if (payload.key === "bad.png") throw s3Error("OBJECT_NOT_FOUND");
          return signed(payload.key);
        }),
      });
      const onError = vi.fn();
      const hook = renderHook(() =>
        useDownload({
          api,
          route: "uploads",
          beforeDownload: (key) => key !== "skip.png",
          onError,
        }),
      );

      const result = await hook.current.presignMany([
        { key: "a.png", fileName: "A.png", expiresIn: 900 },
        { key: "skip.png" },
        { key: "bad.png" },
        { key: "b.png" },
      ]);

      expect(api.download).toHaveBeenCalledWith(
        { route: "uploads", key: "a.png", name: "A.png", expiresIn: 900 },
        { signal: undefined },
      );
      expect(result).toEqual({
        signed: [signed("a.png"), signed("b.png")],
        failed: [
          {
            key: "bad.png",
            error: expect.objectContaining({ code: "OBJECT_NOT_FOUND" }),
          },
        ],
        blocked: ["skip.png"],
      });
      expect(onError).not.toHaveBeenCalled();
      expect(hook.current.operations).toEqual([]);
      hook.unmount();
    });

    it("signs at most four keys at once", async () => {
      let active = 0;
      let peak = 0;
      const api = fakeS3Api({
        download: vi.fn(async (payload: DownloadPayload) => {
          active += 1;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active -= 1;
          return signed(payload.key);
        }),
      });
      const hook = renderHook(() => useDownload({ api, route: "uploads" }));

      const keys = Array.from({ length: 10 }, (_, index) => `${index}.png`);
      const result = await hook.current.presignMany(
        keys.map((key) => ({ key })),
      );

      expect(peak).toBe(4);
      expect(result.signed.map(({ key }) => key)).toEqual(keys);
      hook.unmount();
    });
  });
});
