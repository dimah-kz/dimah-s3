import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFileUpload } from "./use-file-upload";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import { uploadFile } from "@/upload";

vi.mock("@/upload", () => ({
  uploadFile: vi.fn(async () => ({ key: "k", eTag: "e" })),
}));

describe("useFileUpload", () => {
  it("rejects a disallowed type before calling the engine", async () => {
    const hook = renderHook(() =>
      useFileUpload({ api: fakeS3Api(), accept: [".png"] }),
    );

    await act(async () => {
      await hook.current.upload(
        new File(["x"], "a.exe", { type: "application/octet-stream" }),
        "k",
      );
    });

    expect(hook.current.phase).toBe("error");
    expect(hook.current.error?.message).toContain(".exe");
    expect(uploadFile).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("uploads through the engine and lands on success", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useFileUpload({ api }));

    await act(async () => {
      await hook.current.upload(
        new File(["hello"], "a.txt", { type: "text/plain" }),
        "k",
      );
    });

    expect(uploadFile).toHaveBeenCalledWith(
      api,
      expect.any(File),
      "k",
      expect.anything(),
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
});
