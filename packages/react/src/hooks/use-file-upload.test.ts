import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { s3Error, type APIError, type S3Api } from "@dimah-s3/core";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import type { UploadFileOptions, UploadResult } from "@/types/upload";
import { getUploadAbortKind } from "@/upload/abort";
import { uploadFile } from "@/upload/upload-file";
import { useFileUpload, type UseFileUploadOptions } from "./use-file-upload";

vi.mock("@/upload/upload-file", () => ({ uploadFile: vi.fn() }));

/** One `uploadFile` call the test settles by hand. */
type EngineCall = {
  file: File;
  options: UploadFileOptions;
  succeed: () => void;
  fail: (error: APIError) => void;
};

let engineCalls: EngineCall[] = [];

function resultFor(file: File): UploadResult {
  return {
    key: `uploads/${file.name}`,
    bucket: "bucket",
    name: file.name,
    size: file.size,
    metadata: {},
  };
}

function engineCall(name: string): EngineCall {
  const call = engineCalls.find(({ file }) => file.name === name);
  if (!call) throw new Error(`uploadFile was not called for ${name}`);
  return call;
}

function txt(name: string, size = 4) {
  return new File(["x".repeat(size)], name, { type: "text/plain" });
}

function mount(
  options: Partial<UseFileUploadOptions> = {},
  api: S3Api = fakeS3Api(),
) {
  return renderHook(() => useFileUpload({ api, route: "uploads", ...options }));
}

/** Lets pending promises and React updates run. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  engineCalls = [];
  vi.mocked(uploadFile).mockImplementation(
    (_api, file, options) =>
      new Promise((resolve, reject) => {
        const { signal } = options;
        signal?.addEventListener(
          "abort",
          () => reject(signal.reason as DOMException),
          {
            once: true,
          },
        );
        engineCalls.push({
          file,
          options,
          succeed: () => {
            options.onPhaseChange?.("uploading");
            options.onProgress?.({
              loaded: file.size,
              total: file.size,
              percent: 100,
            });
            resolve(resultFor(file));
          },
          fail: reject,
        });
      }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useFileUpload", () => {
  it("uploads every file and settles the call with per-file outcomes", async () => {
    const onUploadStart = vi.fn();
    const onProgress = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const hook = mount({
      maxFiles: 2,
      onUploadStart,
      onProgress,
      onSuccess,
      onSettled,
    });
    const a = txt("a.txt");
    const b = txt("b.txt", 6);

    let pending!: ReturnType<typeof hook.current.upload>;
    act(() => {
      pending = hook.current.upload([a, b]);
    });
    expect(hook.current.phase).toBe("uploading");
    await flush();

    expect(onUploadStart).toHaveBeenCalledExactlyOnceWith([a, b]);
    expect(hook.current.files.map((entry) => entry.phase)).toEqual([
      "queued",
      "queued",
    ]);
    expect(hook.current.file?.fileName).toBe("a.txt");

    await act(async () => {
      engineCall("a.txt").succeed();
      engineCall("b.txt").succeed();
    });
    const result = await pending;

    expect(result).toEqual({
      uploaded: [
        { file: a, result: resultFor(a) },
        { file: b, result: resultFor(b) },
      ],
      failed: [],
      blocked: [],
      aborted: [],
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ loaded: 4, percent: 100 }),
      a,
    );
    expect(onSuccess).toHaveBeenCalledWith(resultFor(a), a);
    expect(onSuccess).toHaveBeenCalledWith(resultFor(b), b);
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(hook.current.phase).toBe("success");
    expect(hook.current.isPending).toBe(false);
    expect(hook.current.progress).toMatchObject({
      loaded: 10,
      total: 10,
      percent: 100,
    });
    expect(hook.current.files.map((entry) => entry.result)).toEqual([
      resultFor(a),
      resultFor(b),
    ]);
    hook.unmount();
  });

  it("passes the catalog policy and merged request options to the engine", async () => {
    const { routes } = await fakeS3Api().catalog();
    const api = fakeS3Api({
      catalog: vi.fn(async () => ({
        routes: {
          uploads: {
            ...routes.uploads,
            upload: { enabled: true as const, multipart: true, checksum: true },
          },
        },
      })),
    });
    const hook = mount(
      {
        multipart: false,
        concurrentParts: 3,
        uploadOptions: (file) => ({
          fileName: `hook-${file.name}`,
          metadata: { folder: "docs", owner: "hook" },
        }),
      },
      api,
    );

    await act(async () => {
      void hook.current.upload([txt("a.txt")], {
        uploadOptions: { contentType: "text/csv", metadata: { owner: "call" } },
      });
    });
    await flush();

    expect(engineCall("a.txt").options).toMatchObject({
      route: "uploads",
      policy: { multipart: false, checksum: true },
      concurrentParts: 3,
      request: {
        fileName: "hook-a.txt",
        contentType: "text/csv",
        metadata: { folder: "docs", owner: "call" },
      },
    });
    hook.unmount();
  });

  it("rejects invalid files without stopping the rest of the call", async () => {
    const onFileReject = vi.fn();
    const onSettled = vi.fn();
    const hook = mount({
      accept: [".txt"],
      maxFiles: 3,
      onFileReject,
      onSettled,
    });
    const exe = new File(["x"], "a.exe", { type: "application/x-msdownload" });
    const files = [exe, txt("b.txt"), txt("c.txt"), txt("d.txt")];

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload(files, { maxFiles: 2 });
    });
    await flush();

    const rejections = hook.current.fileRejections;
    expect(rejections.map(({ file }) => file.name)).toEqual(["a.exe", "d.txt"]);
    expect(rejections.map(({ errors }) => errors[0].code)).toEqual([
      "FILE_TYPE_NOT_ALLOWED",
      "TOO_MANY_FILES",
    ]);
    expect(rejections[1].errors[0].params).toEqual({ maxFiles: 2 });
    expect(onFileReject).toHaveBeenCalledExactlyOnceWith(rejections);
    expect(hook.current.files.map((entry) => entry.fileName)).toEqual([
      "b.txt",
      "c.txt",
    ]);

    await act(async () => {
      engineCall("b.txt").succeed();
      engineCall("c.txt").succeed();
    });
    const result = await pending;
    expect(result.uploaded.map(({ file }) => file.name)).toEqual([
      "b.txt",
      "c.txt",
    ]);
    expect(onSettled).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it("ends a call with only rejected files and runs only onSettled", async () => {
    const beforeUpload = vi.fn(() => true);
    const onSettled = vi.fn();
    const hook = mount({ maxFileSize: 2, beforeUpload, onSettled });

    let result!: Awaited<ReturnType<typeof hook.current.upload>>;
    await act(async () => {
      result = await hook.current.upload([txt("big.txt", 10)]);
    });

    expect(result).toEqual({
      uploaded: [],
      failed: [],
      blocked: [],
      aborted: [],
    });
    expect(hook.current.fileRejections[0].errors[0].code).toBe(
      "FILE_TOO_LARGE",
    );
    expect(beforeUpload).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });

  it("fails every file with the catalog error", async () => {
    const catalogError = s3Error("NETWORK_ERROR");
    const api = fakeS3Api({
      catalog: vi.fn(() => Promise.reject(catalogError)),
    });
    const onError = vi.fn();
    const onSettled = vi.fn();
    const hook = mount({ maxFiles: 2, onError, onSettled }, api);
    const files = [txt("a.txt"), txt("b.txt")];

    let result!: Awaited<ReturnType<typeof hook.current.upload>>;
    await act(async () => {
      result = await hook.current.upload(files);
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.failed).toEqual(
      files.map((file) => ({ file, error: catalogError })),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(catalogError, files[0]);
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(hook.current.phase).toBe("error");
    expect(hook.current.files.map((entry) => entry.phase)).toEqual([
      "error",
      "error",
    ]);
    expect(hook.current.error).toMatchObject({
      code: "PARTIAL_FAILURE",
      params: { failed: 2, total: 2 },
    });
    hook.unmount();
  });

  it("reports a failed file's error on the queue", async () => {
    const onError = vi.fn();
    const hook = mount({ onError });
    const failure = s3Error("UPLOAD_FAILED", { status: 500 });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt")]);
    });
    await flush();
    await act(async () => {
      engineCall("a.txt").fail(failure);
    });

    await expect(pending).resolves.toMatchObject({
      failed: [{ error: failure }],
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, expect.any(File));
    expect(hook.current.error).toBe(failure);
    expect(hook.current.file?.phase).toBe("error");
    hook.unmount();
  });

  it("blocks the call when beforeUpload returns false", async () => {
    const onUploadStart = vi.fn();
    const onSettled = vi.fn();
    const hook = mount({
      beforeUpload: () => false,
      onUploadStart,
      onSettled,
    });
    const file = txt("a.txt");

    let result!: Awaited<ReturnType<typeof hook.current.upload>>;
    await act(async () => {
      result = await hook.current.upload([file]);
    });

    expect(result.blocked).toEqual([file]);
    expect(onUploadStart).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(hook.current.files).toEqual([]);
    hook.unmount();
  });

  it.each([
    [
      "beforeUpload",
      {
        beforeUpload: () => {
          throw new Error("nope");
        },
      },
    ],
    [
      "onUploadStart",
      {
        onUploadStart: () => {
          throw new Error("nope");
        },
      },
    ],
  ])(
    "fails the call with HOOK_FAILED when %s throws",
    async (hookName, options) => {
      const hook = mount(options);

      let result!: Awaited<ReturnType<typeof hook.current.upload>>;
      await act(async () => {
        result = await hook.current.upload([txt("a.txt")]);
      });

      expect(uploadFile).not.toHaveBeenCalled();
      expect(result.failed[0].error).toMatchObject({
        code: "HOOK_FAILED",
        params: { hook: hookName },
      });
      hook.unmount();
    },
  );

  it("reports throwing after-callbacks without changing the outcome", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const thrown = new Error("callback");
    const hook = mount({
      onProgress: () => {
        throw thrown;
      },
      onSuccess: () => Promise.reject(thrown),
      onSettled: () => {
        throw thrown;
      },
    });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt")]);
    });
    await flush();
    await act(async () => {
      engineCall("a.txt").succeed();
    });

    await expect(pending).resolves.toMatchObject({
      uploaded: [{ result: resultFor(txt("a.txt")) }],
    });
    expect(reportError).toHaveBeenCalledTimes(3);
    expect(hook.current.file?.phase).toBe("success");
    hook.unmount();
  });

  it("cancels one file by id while the others keep going", async () => {
    const hook = mount({ maxFiles: 2 });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt"), txt("b.txt")]);
    });
    await flush();
    const [a] = hook.current.files;

    await act(async () => {
      hook.current.cancel(a.id);
    });
    expect(getUploadAbortKind(engineCall("a.txt").options.signal?.reason)).toBe(
      "cancel",
    );
    expect(engineCall("b.txt").options.signal?.aborted).toBe(false);
    expect(hook.current.files.map((entry) => entry.fileName)).toEqual([
      "b.txt",
    ]);

    await act(async () => {
      engineCall("b.txt").succeed();
    });
    const result = await pending;
    expect(result.aborted).toEqual([a.file]);
    expect(result.uploaded.map(({ file }) => file.name)).toEqual(["b.txt"]);
    expect(hook.current.phase).toBe("success");
    hook.unmount();
  });

  it("runs at most concurrentFiles uploads and drops a cancelled queued file", async () => {
    const hook = mount({ maxFiles: 3, concurrentFiles: 1 });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt"), txt("b.txt"), txt("c.txt")]);
    });
    await flush();
    expect(engineCalls.map(({ file }) => file.name)).toEqual(["a.txt"]);

    const b = hook.current.files[1];
    await act(async () => {
      hook.current.cancel(b.id);
    });
    await act(async () => {
      engineCall("a.txt").succeed();
    });
    await flush();
    expect(engineCalls.map(({ file }) => file.name)).toEqual([
      "a.txt",
      "c.txt",
    ]);

    await act(async () => {
      engineCall("c.txt").succeed();
    });
    const result = await pending;
    expect(result.aborted).toEqual([b.file]);
    expect(result.uploaded).toHaveLength(2);
    hook.unmount();
  });

  it("aborts a call that is still waiting on beforeUpload", async () => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const onSettled = vi.fn();
    const hook = mount({ beforeUpload: () => promise, onSettled });
    const file = txt("a.txt");

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([file]);
    });
    expect(hook.current.isPending).toBe(true);

    await act(async () => {
      hook.current.cancel();
      resolve(true);
    });
    const result = await pending;

    expect(result.aborted).toEqual([file]);
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(result);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(hook.current.isPending).toBe(false);
    hook.unmount();
  });

  it("detaches every file and leaves an empty queue", async () => {
    const hook = mount({ maxFiles: 2 });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt"), txt("b.txt")]);
    });
    await flush();
    await act(async () => {
      hook.current.detach();
    });

    for (const call of engineCalls) {
      expect(getUploadAbortKind(call.options.signal?.reason)).toBe("detach");
    }
    expect((await pending).aborted).toHaveLength(2);
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });

  it.each([
    ["detaches", { uploadStore: { get: () => null, set() {}, delete() {} } }],
    ["cancels", {}],
  ])("%s running uploads on unmount", async (_label, options) => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const hook = mount({ ...options, onSuccess, onError });

    let pending!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      pending = hook.current.upload([txt("a.txt")]);
    });
    await flush();
    hook.unmount();

    const kind = getUploadAbortKind(engineCall("a.txt").options.signal?.reason);
    expect(kind).toBe("uploadStore" in options ? "detach" : "cancel");
    expect((await pending).aborted).toHaveLength(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("decides detach or cancel on unmount from each call's own options", async () => {
    let uploadStore: UseFileUploadOptions["uploadStore"] = {
      get: () => null,
      set() {},
      delete() {},
    };
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useFileUpload({ api, route: "uploads", queue: true, uploadStore }),
    );

    await act(async () => {
      void hook.current.upload([txt("a.txt")]);
    });
    await flush();
    uploadStore = undefined;
    hook.rerender();
    await act(async () => {
      void hook.current.upload([txt("b.txt")]);
    });
    await flush();
    hook.unmount();

    expect(getUploadAbortKind(engineCall("a.txt").options.signal?.reason)).toBe(
      "detach",
    );
    expect(getUploadAbortKind(engineCall("b.txt").options.signal?.reason)).toBe(
      "cancel",
    );
  });

  it("stops engine callbacks once a file is cancelled", async () => {
    const onProgress = vi.fn();
    const onPartUpload = vi.fn();
    const onMultipartInit = vi.fn();
    const hook = mount({ onProgress, onPartUpload, onMultipartInit });

    await act(async () => {
      void hook.current.upload([txt("a.txt")]);
    });
    await flush();
    const { options } = engineCall("a.txt");
    await act(async () => {
      hook.current.cancel();
    });
    act(() => {
      options.onPhaseChange?.("uploading");
      options.onProgress?.({ loaded: 2, total: 4, percent: 50 });
      options.onPartUpload?.({ partNumber: 1, totalParts: 2 });
      options.onMultipartInit?.({ uploadId: "u", key: "k" });
    });

    expect(onProgress).not.toHaveBeenCalled();
    expect(onPartUpload).not.toHaveBeenCalled();
    expect(onMultipartInit).not.toHaveBeenCalled();
    expect(hook.current.files).toEqual([]);
    hook.unmount();
  });

  it("replaces the queue by default and cancels the files it replaces", async () => {
    const hook = mount();

    let first!: ReturnType<typeof hook.current.upload>;
    await act(async () => {
      first = hook.current.upload([txt("a.txt")]);
    });
    await flush();
    await act(async () => {
      void hook.current.upload([txt("b.txt")]);
    });
    await flush();

    expect(getUploadAbortKind(engineCall("a.txt").options.signal?.reason)).toBe(
      "cancel",
    );
    expect((await first).aborted).toHaveLength(1);
    expect(hook.current.files.map((entry) => entry.fileName)).toEqual([
      "b.txt",
    ]);
    hook.unmount();
  });

  it("appends to the queue when queue is true", async () => {
    const hook = mount({ queue: true });

    await act(async () => {
      void hook.current.upload([txt("a.txt")]);
    });
    await flush();
    await act(async () => {
      engineCall("a.txt").succeed();
    });
    await act(async () => {
      void hook.current.upload([txt("b.txt")]);
    });
    await flush();

    expect(
      hook.current.files.map(({ fileName, phase }) => [fileName, phase]),
    ).toEqual([
      ["a.txt", "success"],
      ["b.txt", "queued"],
    ]);
    hook.unmount();
  });

  it("reset removes settled files and keeps running ones, with a stable identity", async () => {
    const hook = mount({ queue: true, accept: [".txt"] });
    const { reset } = hook.current;

    await act(async () => {
      void hook.current.upload([txt("a.txt")]);
    });
    await flush();
    await act(async () => {
      engineCall("a.txt").succeed();
    });
    await act(async () => {
      void hook.current.upload([
        txt("b.txt"),
        new File(["x"], "c.exe", { type: "application/x-msdownload" }),
      ]);
    });
    await flush();
    expect(hook.current.fileRejections).toHaveLength(1);

    act(() => {
      hook.current.reset();
    });

    expect(hook.current.reset).toBe(reset);
    expect(hook.current.files.map((entry) => entry.fileName)).toEqual([
      "b.txt",
    ]);
    expect(hook.current.fileRejections).toEqual([]);
    expect(engineCall("b.txt").options.signal?.aborted).toBe(false);
    hook.unmount();
  });

  it("creates image previews and revokes them when files leave the queue", async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL,
    });
    const hook = mount();

    await act(async () => {
      void hook.current.upload([
        new File(["x"], "a.png", { type: "image/png" }),
      ]);
    });
    await flush();
    expect(hook.current.file?.previewUrl).toBe("blob:preview");

    await act(async () => {
      hook.current.cancel();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(hook.current.files).toEqual([]);
    hook.unmount();
  });
});
