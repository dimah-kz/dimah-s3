import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test/render-hook";
import { useFileIntake } from "./use-file-intake";

describe("useFileIntake", () => {
  it("puts the HTML accept list on the file input", () => {
    const hook = renderHook(() =>
      useFileIntake({
        accept: ["image/*", ".pdf"],
        onAccept: vi.fn(),
      }),
    );

    expect(hook.current.getInputProps().accept).toBe("image/*,.pdf");
    hook.unmount();
  });

  it("omits accept on the input when no tokens are set", () => {
    const hook = renderHook(() => useFileIntake({ onAccept: vi.fn() }));
    expect(hook.current.getInputProps().accept).toBeUndefined();
    hook.unmount();
  });

  it("opens a mounted input after another input of the same hook unmounts", () => {
    const hook = renderHook(() => useFileIntake({ onAccept: vi.fn() }));
    const { ref } = hook.current.getInputProps() as {
      ref: (node: HTMLInputElement | null) => void;
    };
    const host = document.createElement("div");
    document.body.append(host);
    const kept = document.createElement("input");
    const removed = document.createElement("input");
    host.append(kept, removed);
    const keptClick = vi.spyOn(kept, "click").mockImplementation(() => {});
    const removedClick = vi.spyOn(removed, "click");

    ref(kept);
    ref(removed);
    removed.remove();
    ref(null);
    hook.current.open();

    expect(keptClick).toHaveBeenCalledTimes(1);
    expect(removedClick).not.toHaveBeenCalled();
    host.remove();
    hook.unmount();
  });

  it("does not warn for mixed MIME and extension tokens", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hook = renderHook(() =>
      useFileIntake({
        accept: ["image/*", ".pdf", "video/*"],
        onAccept: vi.fn(),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
    hook.unmount();
  });
});
