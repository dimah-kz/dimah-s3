import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test/render-hook";
import { useControllableState, useLiveRef, useOperationStore } from "./hooks";

type Op = { id: string; key: string; phase: "running" | "done" };

describe("useLiveRef", () => {
  it("keeps the same ref and reads the latest value", () => {
    let value = 1;
    const hook = renderHook(() => useLiveRef(value));
    const ref = hook.current;

    value = 2;
    hook.rerender();

    expect(hook.current).toBe(ref);
    expect(ref.current).toBe(2);
    hook.unmount();
  });
});

describe("useControllableState", () => {
  it("keeps local state when uncontrolled and reports changes", () => {
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useControllableState<string>(undefined, "a", onChange),
    );

    act(() => hook.current[1]("b"));
    act(() => hook.current[1]("b"));

    expect(hook.current[0]).toBe("b");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
    hook.unmount();
  });

  it("follows the controlled value and only reports changes", () => {
    let value = "a";
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useControllableState<string>(value, "default", onChange),
    );
    const set = hook.current[1];

    act(() => set("b"));
    expect(hook.current[0]).toBe("a");
    expect(onChange).toHaveBeenCalledWith("b");

    value = "c";
    hook.rerender();
    expect(hook.current[0]).toBe("c");
    expect(hook.current[1]).toBe(set);
    hook.unmount();
  });

  it("skips values that isEqual treats as unchanged", () => {
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useControllableState<{ id: number }>(
        undefined,
        () => ({ id: 1 }),
        onChange,
        (a, b) => a.id === b.id,
      ),
    );
    const initial = hook.current[0];

    act(() => hook.current[1]({ id: 1 }));

    expect(hook.current[0]).toBe(initial);
    expect(onChange).not.toHaveBeenCalled();
    hook.unmount();
  });
});

describe("useOperationStore", () => {
  it("re-renders with operations, pending keys and the newest operation", async () => {
    const hook = renderHook(() => useOperationStore<Op, string>());
    const { store } = hook.current;
    const claim = store.claim("a");

    act(() => {
      claim.publish({ phase: "running" });
    });
    expect(hook.current.store).toBe(store);
    expect(hook.current.pendingKeys).toEqual(["a"]);
    expect(hook.current.get("a")?.phase).toBe("running");

    await act(async () => {
      claim.update({ phase: "done" });
      await claim.settle("ok");
    });
    expect(hook.current.pendingKeys).toEqual([]);
    expect(hook.current.operations).toEqual([
      { id: expect.any(String), key: "a", phase: "done" },
    ]);
    expect(hook.current.get("b")).toBeUndefined();
    hook.unmount();
  });
});
