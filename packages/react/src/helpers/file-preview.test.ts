import { describe, expect, it, vi } from "vitest";
import { createImagePreviewUrl, revokePreviewUrl } from "./file-preview";

describe("createImagePreviewUrl", () => {
  it("creates an object URL for images", () => {
    const create = vi.fn(() => "blob:preview");
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: create,
      revokeObjectURL: vi.fn(),
    });

    const url = createImagePreviewUrl(
      new File(["x"], "a.png", { type: "image/png" }),
    );
    expect(url).toBe("blob:preview");
    expect(create).toHaveBeenCalledOnce();
  });

  it("returns null for non-images", () => {
    expect(
      createImagePreviewUrl(new File(["x"], "a.txt", { type: "text/plain" })),
    ).toBeNull();
  });
});

describe("revokePreviewUrl", () => {
  it("is a no-op for empty values", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: revoke });
    revokePreviewUrl(null);
    revokePreviewUrl(undefined);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes a real URL", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: revoke });
    revokePreviewUrl("blob:preview");
    expect(revoke).toHaveBeenCalledWith("blob:preview");
  });
});
