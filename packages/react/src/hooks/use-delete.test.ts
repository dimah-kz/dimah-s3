import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDelete } from "./use-delete";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";

describe("useDelete", () => {
  it("confirms the pending key", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const hook = renderHook(() =>
      useDelete({ api, route: "uploads", onSuccess }),
    );

    act(() => {
      hook.current.requestDelete("a.png");
    });
    expect(hook.current).toMatchObject({
      phase: "confirming",
      pendingKey: "a.png",
    });

    await act(async () => {
      await hook.current.confirmDelete();
    });

    expect(api.delete).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
    });
    expect(onSuccess).toHaveBeenCalledWith("a.png");
    expect(hook.current.phase).toBe("success");
    hook.unmount();
  });

  it("honors beforeDelete", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useDelete({ api, route: "uploads", beforeDelete: async () => false }),
    );

    act(() => {
      hook.current.requestDelete("a.png");
    });
    await act(async () => {
      await hook.current.confirmDelete();
    });

    expect(api.delete).not.toHaveBeenCalled();
    expect(hook.current.phase).toBe("error");
    hook.unmount();
  });

  it("ignores a second confirmDelete while one is in flight", async () => {
    const api = fakeS3Api();
    let release!: () => void;
    vi.mocked(api.delete).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ success: true as const, bucket: "bucket", key: "a.png" });
        }),
    );
    const hook = renderHook(() => useDelete({ api, route: "uploads" }));
    act(() => {
      hook.current.requestDelete("a.png");
    });

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = hook.current.confirmDelete();
    });
    await act(async () => {
      await hook.current.confirmDelete();
    });
    expect(api.delete).toHaveBeenCalledOnce();

    await act(async () => {
      release();
      await first;
    });
    hook.unmount();
  });

  it("removes a key without a confirm step", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const hook = renderHook(() =>
      useDelete({ api, route: "uploads", onSuccess }),
    );

    await act(async () => {
      await hook.current.remove("a.png");
    });

    expect(api.delete).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
    });
    expect(onSuccess).toHaveBeenCalledWith("a.png");
    expect(hook.current.phase).toBe("success");
    expect(hook.current.pendingKey).toBeNull();
    hook.unmount();
  });
});
