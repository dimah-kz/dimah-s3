import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/render-hook";
import { useFileIntake } from "./use-file-intake";

describe("useFileIntake", () => {
  it("puts the original HTML accept list on the file input", () => {
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
});
