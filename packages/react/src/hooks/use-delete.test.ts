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
      objectKey: "a.png",
      isConfirming: true,
      isDeleting: false,
      isPending: true,
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
    expect(hook.current.isPending).toBe(false);
    expect(hook.current.objectKey).toBe("a.png");
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
    expect(hook.current.objectKey).toBe("a.png");
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
    expect(hook.current.objectKey).toBe("a.png");
    hook.unmount();
  });

  it("deletes several keys via deleteMany", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const hook = renderHook(() =>
      useDelete({ api, route: "uploads", onSuccess }),
    );

    await act(async () => {
      await hook.current.removeMany(["a.png", "b.png"]);
    });

    expect(api.deleteMany).toHaveBeenCalledWith({
      route: "uploads",
      keys: ["a.png", "b.png"],
    });
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(hook.current.phase).toBe("success");
    hook.unmount();
  });

  it("ignores requestDelete while a delete is in flight", async () => {
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
    act(() => {
      hook.current.requestDelete("b.png");
    });
    expect(hook.current).toMatchObject({
      phase: "deleting",
      objectKey: "a.png",
    });

    await act(async () => {
      release();
      await first;
    });
    hook.unmount();
  });

  it("does not apply a late success after reset", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    let release!: () => void;
    vi.mocked(api.delete).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ success: true as const, bucket: "bucket", key: "a.png" });
        }),
    );
    const hook = renderHook(() =>
      useDelete({ api, route: "uploads", onSuccess }),
    );
    act(() => {
      hook.current.requestDelete("a.png");
    });

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = hook.current.confirmDelete();
    });
    act(() => {
      hook.current.reset();
    });
    expect(hook.current.phase).toBe("idle");

    await act(async () => {
      release();
      await pending;
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(hook.current.phase).toBe("idle");
    hook.unmount();
  });

  it("rejects deleteMany above the batch cap", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() => useDelete({ api, route: "uploads" }));
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}.png`);

    await expect(
      act(async () => {
        await hook.current.removeMany(keys);
      }),
    ).rejects.toThrow(/at most 100 keys/i);
    expect(api.deleteMany).not.toHaveBeenCalled();
    hook.unmount();
  });
});
