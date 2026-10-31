import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DownloadPayload,
  DownloadPresignResponse,
  S3RequestOptions,
} from "@dimah-s3/core";
import { abortable } from "@/internal/abortable";
import type * as browserDownload from "@/internal/browser-download";
import { saveBlob } from "@/internal/browser-download";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import type { FetchDownloadOutcome } from "@/types/download";
import { useFetchDownload } from "./use-fetch-download";

vi.mock("@/internal/browser-download", async (importOriginal) => ({
  ...(await importOriginal<typeof browserDownload>()),
  saveBlob: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const encoder = new TextEncoder();

/** A response that streams `chunks`, with optional headers. */
function streamResponse(chunks: string[], headers: HeadersInit = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

/** Stubs the global `fetch` with `implementation`. */
function stubFetch(
  implementation: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A `fetch` that settles only by rejecting with the abort reason. */
function fetchUntilAborted() {
  return stubFetch((_url, init) =>
    abortable(new Promise<Response>(() => {}), init?.signal ?? undefined),
  );
}

describe("useFetchDownload", () => {
  it("fetches with progress, saves the file and records the operation", async () => {
    const fetchMock = stubFetch(async () =>
      streamResponse(["hello ", "world"], {
        "content-length": "11",
        "content-type": "text/plain",
        "content-disposition": `attachment; filename="greeting.txt"`,
      }),
    );
    const api = fakeS3Api();
    const onDownloadStart = vi.fn();
    const onProgress = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useFetchDownload({
        api,
        route: "uploads",
        disposition: "attachment",
        onDownloadStart,
        onProgress,
        onSuccess,
        onSettled,
      }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("docs/a.txt");
    });

    expect(api.download).toHaveBeenCalledWith(
      { route: "uploads", key: "docs/a.txt", disposition: "attachment" },
      { signal: expect.any(AbortSignal) },
    );
    expect(fetchMock).toHaveBeenCalledWith("https://s3.test/dl/docs/a.txt", {
      signal: expect.any(AbortSignal),
    });
    const data = { fileName: "greeting.txt", size: 11 };
    expect(outcome).toEqual({ status: "success", key: "docs/a.txt", data });
    expect(saveBlob).toHaveBeenCalledExactlyOnceWith(
      expect.any(Blob),
      "greeting.txt",
    );
    const blob = vi.mocked(saveBlob).mock.calls[0]?.[0];
    expect(await blob?.text()).toBe("hello world");
    expect(onDownloadStart).toHaveBeenCalledExactlyOnceWith("docs/a.txt");
    // `speed` depends on timing, so only the byte counts are compared.
    expect(onProgress.mock.calls.map(([progress]) => progress)).toMatchObject([
      { loaded: 6, total: 11, percent: 55 },
      { loaded: 11, total: 11, percent: 100 },
    ]);
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(data, "docs/a.txt");
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(hook.current.operations).toEqual([
      {
        id: expect.any(String),
        key: "docs/a.txt",
        fileName: "greeting.txt",
        fileSize: 11,
        phase: "success",
        error: null,
        progress: { loaded: 11, total: 11, percent: 100 },
      },
    ]);
    expect(hook.current).toMatchObject({
      mode: "fetch",
      instanceId: expect.any(String),
      pendingKeys: [],
      isPending: false,
    });
    hook.unmount();
  });

  it("names the file from the request, then the key", async () => {
    stubFetch(async () => streamResponse(["abc"]));
    const hook = renderHook(() =>
      useFetchDownload({ api: fakeS3Api(), route: "uploads" }),
    );

    await act(async () => {
      await hook.current.download("docs/a.txt", { fileName: "Report.txt" });
      await hook.current.download("docs/b.txt");
    });

    expect(vi.mocked(saveBlob).mock.calls.map(([, name]) => name)).toEqual([
      "Report.txt",
      "b.txt",
    ]);
    hook.unmount();
  });

  it("uses fileSize as the total until the response gives one", async () => {
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>();
    stubFetch(async () => {
      await gate;
      return streamResponse(["abcd"]);
    });
    const hook = renderHook(() =>
      useFetchDownload({ api: fakeS3Api(), route: "uploads" }),
    );

    let pending!: Promise<FetchDownloadOutcome>;
    await act(async () => {
      pending = hook.current.download("a.bin", { fileSize: 8 });
    });
    expect(hook.current.get("a.bin")).toMatchObject({
      phase: "downloading",
      fileName: null,
      fileSize: 8,
      progress: { loaded: 0, total: 8, percent: 0 },
    });

    await act(async () => {
      openGate();
      await pending;
    });
    expect(hook.current.get("a.bin")).toMatchObject({
      phase: "success",
      fileSize: 4,
    });
    hook.unmount();
  });

  it("joins a second download of the same key", async () => {
    const { promise: gate, resolve: openGate } = Promise.withResolvers<void>();
    const fetchMock = stubFetch(async () => {
      await gate;
      return streamResponse(["abc"]);
    });
    const api = fakeS3Api();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useFetchDownload({ api, route: "uploads", onSettled }),
    );

    let first!: Promise<FetchDownloadOutcome>;
    let second!: Promise<FetchDownloadOutcome>;
    await act(async () => {
      first = hook.current.download("a.txt");
      second = hook.current.download("a.txt");
    });

    expect(second).toBe(first);
    expect(hook.current.pendingKeys).toEqual(["a.txt"]);

    await act(async () => {
      openGate();
      await first;
    });

    expect(api.download).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(hook.current.operations).toHaveLength(1);
    hook.unmount();
  });

  it("aborts only the cancelled key", async () => {
    fetchUntilAborted();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const hook = renderHook(() =>
      useFetchDownload({
        api: fakeS3Api(),
        route: "uploads",
        onError,
        onSettled,
      }),
    );

    let a!: Promise<FetchDownloadOutcome>;
    await act(async () => {
      a = hook.current.download("a.txt");
      void hook.current.download("b.txt");
    });
    expect(hook.current.pendingKeys).toEqual(["a.txt", "b.txt"]);

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      hook.current.cancel("a.txt");
      outcome = await a;
    });

    expect(outcome).toEqual({ status: "aborted", key: "a.txt" });
    expect(hook.current.get("a.txt")?.phase).toBe("aborted");
    expect(hook.current.get("b.txt")?.phase).toBe("downloading");
    expect(hook.current.pendingKeys).toEqual(["b.txt"]);
    expect(saveBlob).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(outcome);

    await act(async () => {
      hook.current.cancel();
    });
    expect(hook.current.get("b.txt")?.phase).toBe("aborted");
    hook.unmount();
  });

  it("fails with DOWNLOAD_FAILED on a non-2xx response", async () => {
    stubFetch(async () => new Response("missing", { status: 404 }));
    const onError = vi.fn();
    const hook = renderHook(() =>
      useFetchDownload({ api: fakeS3Api(), route: "uploads", onError }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.txt");
    });

    expect(outcome).toMatchObject({
      status: "error",
      error: { code: "DOWNLOAD_FAILED", params: { status: 404 } },
    });
    expect(hook.current.get("a.txt")).toMatchObject({
      phase: "error",
      error: { code: "DOWNLOAD_FAILED" },
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DOWNLOAD_FAILED" }),
      "a.txt",
    );
    expect(saveBlob).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("lets onError download the same key again", async () => {
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    let retry: Promise<FetchDownloadOutcome> | undefined;
    const hook = renderHook(() =>
      useFetchDownload({
        api: fakeS3Api(),
        route: "uploads",
        onError: (_error, key) => {
          retry = hook.current.download(key);
        },
      }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    let retried: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.txt");
      retried = await retry;
    });

    expect(outcome).toMatchObject({ status: "error", key: "a.txt" });
    expect(retried).toEqual({
      status: "success",
      key: "a.txt",
      data: { fileName: "a.txt", size: 2 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hook.current.pendingKeys).toEqual([]);
    expect(hook.current.get("a.txt")?.phase).toBe("success");
    hook.unmount();
  });

  it("fails with NETWORK_ERROR when the request fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const hook = renderHook(() =>
      useFetchDownload({ api: fakeS3Api(), route: "uploads" }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.txt");
    });

    expect(outcome).toMatchObject({
      status: "error",
      error: { code: "NETWORK_ERROR" },
    });
    hook.unmount();
  });

  it("fails with HOOK_FAILED when onDownloadStart throws", async () => {
    const fetchMock = stubFetch(async () => streamResponse(["abc"]));
    const hook = renderHook(() =>
      useFetchDownload({
        api: fakeS3Api(),
        route: "uploads",
        onDownloadStart: () => {
          throw new Error("boom");
        },
      }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.txt");
    });

    expect(outcome).toMatchObject({
      status: "error",
      error: { code: "HOOK_FAILED", params: { hook: "onDownloadStart" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("blocks without an operation when beforeDownload returns false", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useFetchDownload({
        api,
        route: "uploads",
        beforeDownload: async () => false,
      }),
    );

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      outcome = await hook.current.download("a.txt");
    });

    expect(outcome).toEqual({ status: "blocked", key: "a.txt" });
    expect(api.download).not.toHaveBeenCalled();
    expect(hook.current.operations).toEqual([]);
    hook.unmount();
  });

  it("aborts the presign when cancelled before the fetch", async () => {
    const fetchMock = stubFetch(async () => streamResponse(["abc"]));
    const api = fakeS3Api({
      download: vi.fn((_payload: DownloadPayload, options?: S3RequestOptions) =>
        abortable(
          new Promise<DownloadPresignResponse>(() => {}),
          options?.signal,
        ),
      ),
    });
    const hook = renderHook(() => useFetchDownload({ api, route: "uploads" }));

    let pending!: Promise<FetchDownloadOutcome>;
    await act(async () => {
      pending = hook.current.download("a.txt");
    });
    expect(hook.current.get("a.txt")?.phase).toBe("presigning");

    let outcome: FetchDownloadOutcome | undefined;
    await act(async () => {
      hook.current.cancel("a.txt");
      outcome = await pending;
    });

    expect(outcome).toEqual({ status: "aborted", key: "a.txt" });
    expect(fetchMock).not.toHaveBeenCalled();
    hook.unmount();
  });
});
