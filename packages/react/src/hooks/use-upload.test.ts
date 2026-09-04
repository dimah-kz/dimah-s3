import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpload } from "./use-upload";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import { uploadFiles } from "@/upload";
import type { FileItem } from "@/upload";

vi.mock("./use-file-intake", () => ({
  useFileIntake: () => ({
    getRootProps: <T>(props?: T) => (props ?? {}) as T,
    getInputProps: <T>(props?: T) => (props ?? {}) as T,
    open: vi.fn(),
    isDragActive: false,
    isDragAccept: false,
    isDragReject: false,
    fileRejections: [],
  }),
}));

vi.mock("@/upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/upload")>();
  return {
    ...actual,
    uploadFiles: vi.fn(),
  };
});

const successResult = { key: "k", eTag: "e", contentLength: 1 };

function mockSuccessBatch() {
  vi.mocked(uploadFiles).mockImplementation(
    async (_api, items, _config, cb) => {
      const results: FileItem[] = [];
      for (const item of items) {
        cb?.onFilePhaseChange?.(item.id, "presigning");
        cb?.onFilePhaseChange?.(item.id, "uploading");
        const progress = {
          loaded: item.file.size,
          total: item.file.size,
          percent: 100,
        };
        cb?.onFileProgress?.(item.id, progress);
        cb?.onFileSuccess?.(item.id, successResult);
        cb?.onTotalProgress?.({
          loaded: item.file.size,
          total: item.file.size,
          percent: 100,
        });
        results.push({
          ...item,
          status: "success",
          progress,
          result: successResult,
          error: null,
        });
      }
      return results;
    },
  );
}

describe("useUpload", () => {
  beforeEach(() => {
    vi.mocked(uploadFiles).mockReset();
    mockSuccessBatch();
  });

  it("rejects a disallowed type before calling the engine", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useUpload({ api, route: "uploads", accept: [".png"] }),
    );

    await act(async () => {
      await hook.current.handleFiles(
        new File(["x"], "a.exe", { type: "application/octet-stream" }),
      );
    });

    expect(hook.current.phase).toBe("error");
    expect(hook.current.error?.message).toContain(".exe");
    expect(hook.current.file?.name).toBe("a.exe");
    expect(hook.current.file?.status).toBe("error");
    expect(uploadFiles).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("uploads through the engine and lands on success", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useUpload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.handleFiles(
        new File(["hello"], "a.txt", { type: "text/plain" }),
      );
    });

    expect(uploadFiles).toHaveBeenCalledWith(
      api,
      expect.arrayContaining([
        expect.objectContaining({ file: expect.any(File) }),
      ]),
      expect.objectContaining({ route: "uploads" }),
      expect.anything(),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(hook.current.phase).toBe("success");
    expect(hook.current.file).toMatchObject({
      name: "a.txt",
      size: 5,
      type: "text/plain",
      status: "success",
    });
    expect(hook.current.files).toHaveLength(1);
    expect(hook.current.isPending).toBe(false);
    expect(hook.current.isUploading).toBe(false);
    expect(hook.current.file?.result).toEqual(successResult);
    expect(hook.current.policy.maxFiles).toBe(1);
    expect(hook.current.policy.catalogStatus).toBe("ready");
    hook.unmount();
  });

  it("uploads several files when maxFiles allows it", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const hook = renderHook(() =>
      useUpload({
        api,
        route: "uploads",
        maxFiles: 3,
        onSuccess,
      }),
    );

    await act(async () => {
      await hook.current.handleFiles([
        new File(["a"], "a.txt", { type: "text/plain" }),
        new File(["bb"], "b.txt", { type: "text/plain" }),
      ]);
    });

    expect(hook.current.phase).toBe("success");
    expect(hook.current.files).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledWith([successResult, successResult]);
    hook.unmount();
  });

  it("rejects a batch that exceeds maxFiles", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useUpload({ api, route: "uploads", maxFiles: 1 }),
    );

    await act(async () => {
      await hook.current.handleFiles([
        new File(["a"], "a.txt", { type: "text/plain" }),
        new File(["b"], "b.txt", { type: "text/plain" }),
      ]);
    });

    expect(hook.current.phase).toBe("error");
    expect(hook.current.error?.message).toContain("Maximum is 1");
    expect(uploadFiles).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("does not fire onCancel when reset aborts an in-flight upload", async () => {
    const api = fakeS3Api();
    const onCancel = vi.fn();
    vi.mocked(uploadFiles).mockImplementation(
      (_api, _items, _config, _cb, signal) =>
        new Promise((_resolve, reject) => {
          const abort = () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          };
          if (signal?.aborted) {
            abort();
            return;
          }
          signal?.addEventListener("abort", abort);
        }),
    );

    const hook = renderHook(() =>
      useUpload({ api, route: "uploads", onCancel }),
    );
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    let uploadPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      uploadPromise = hook.current.handleFiles(file);
    });
    await act(async () => {
      hook.current.reset();
      await uploadPromise;
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });

  it("stops before the engine when cancel runs during beforeUpload", async () => {
    const api = fakeS3Api();
    const onCancel = vi.fn();
    let release!: (allowed: boolean) => void;
    const beforeUpload = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });

    const hook = renderHook(() =>
      useUpload({
        api,
        route: "uploads",
        onCancel,
        beforeUpload,
      }),
    );
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    let uploadPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      uploadPromise = hook.current.handleFiles(file);
    });
    await act(async () => {
      hook.current.cancel();
      release(true);
      await uploadPromise;
    });

    expect(uploadFiles).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });

  it("fills accept from the route catalog", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => ({
        routes: {
          uploads: {
            upload: {
              enabled: true as const,
              fileTypes: [".png"],
              multipart: false,
            },
            download: { enabled: false as const },
            delete: { enabled: false as const },
          },
        },
      })),
    });
    const hook = renderHook(() => useUpload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.handleFiles(
        new File(["x"], "a.txt", { type: "text/plain" }),
      );
    });

    expect(hook.current.phase).toBe("error");
    expect(uploadFiles).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("still uploads when the route catalog fails", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => {
        throw new Error("catalog down");
      }),
    });
    const hook = renderHook(() => useUpload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.handleFiles(
        new File(["hello"], "a.txt", { type: "text/plain" }),
      );
    });

    expect(hook.current.policy.catalogStatus).toBe("error");
    expect(hook.current.policy.catalogError?.message).toBe("catalog down");
    expect(hook.current.phase).toBe("success");
    expect(uploadFiles).toHaveBeenCalled();
    hook.unmount();
  });
});
