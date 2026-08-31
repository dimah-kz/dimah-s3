import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileUpload } from "./use-file-upload";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import { uploadFile } from "@/upload";

vi.mock("@/upload", () => ({
  uploadFile: vi.fn(async () => ({ key: "k", eTag: "e" })),
}));

describe("useFileUpload", () => {
  beforeEach(() => {
    vi.mocked(uploadFile).mockReset();
    vi.mocked(uploadFile).mockResolvedValue({ key: "k", eTag: "e" });
  });
  it("rejects a disallowed type before calling the engine", async () => {
    const hook = renderHook(() =>
      useFileUpload({ api: fakeS3Api(), route: "uploads", accept: [".png"] }),
    );

    await act(async () => {
      await hook.current.upload(
        new File(["x"], "a.exe", { type: "application/octet-stream" }),
      );
    });

    expect(hook.current.phase).toBe("error");
    expect(hook.current.error?.message).toContain(".exe");
    expect(uploadFile).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("uploads through the engine and lands on success", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useFileUpload({ api, route: "uploads" }));

    await act(async () => {
      await hook.current.upload(
        new File(["hello"], "a.txt", { type: "text/plain" }),
      );
    });

    expect(uploadFile).toHaveBeenCalledWith(
      api,
      expect.any(File),
      expect.objectContaining({ route: "uploads" }),
      expect.anything(),
      expect.any(AbortSignal),
      undefined,
    );
    expect(hook.current.phase).toBe("success");
    expect(hook.current.fileInfo).toMatchObject({
      name: "a.txt",
      size: 5,
      type: "text/plain",
    });
    expect(hook.current.isPending).toBe(false);
    expect(hook.current.isUploading).toBe(false);
    expect(hook.current.result).toEqual({ key: "k", eTag: "e" });
    hook.unmount();
  });

  it("does not fire onCancel when reset aborts an in-flight upload", async () => {
    const onCancel = vi.fn();
    vi.mocked(uploadFile).mockImplementation(
      (_api, _file, _config, _callbacks, signal) =>
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
      useFileUpload({ api: fakeS3Api(), route: "uploads", onCancel }),
    );
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    let uploadPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      uploadPromise = hook.current.upload(file);
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
    const onCancel = vi.fn();
    let release!: (allowed: boolean) => void;
    const beforeUpload = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });

    const hook = renderHook(() =>
      useFileUpload({
        api: fakeS3Api(),
        route: "uploads",
        onCancel,
        beforeUpload,
      }),
    );
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    let uploadPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      uploadPromise = hook.current.upload(file);
    });
    await act(async () => {
      hook.current.cancel();
      release(true);
      await uploadPromise;
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith(file);
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });
});
