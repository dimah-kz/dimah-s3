import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDelete } from "./use-delete";
import { fakeS3Api } from "../test/api";
import { renderHook } from "../test/render-hook";

describe("useDelete", () => {
  it("confirms the pending key", async () => {
    const api = fakeS3Api();
    const onSuccess = vi.fn();
    const hook = renderHook(() => useDelete({ api, onSuccess }));

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

    expect(api.delete).toHaveBeenCalledWith("a.png", { bucket: undefined });
    expect(onSuccess).toHaveBeenCalledWith("a.png");
    expect(hook.current.phase).toBe("success");
    hook.unmount();
  });

  it("honors beforeDelete", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useDelete({ api, beforeDelete: async () => false }),
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
});
