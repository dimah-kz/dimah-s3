import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import { renderHook } from "@/test/render";
import { useUploadHints, type UploadHintsPolicy } from "@/lib/upload-hints";

const MiB = 1024 * 1024;

function hints(policy: UploadHintsPolicy) {
  return renderHook(() => useUploadHints(policy)).result.current;
}

describe("useUploadHints", () => {
  it("is empty for a policy without limits", () => {
    expect(hints({ maxFiles: 1 })).toEqual({ limits: null, accept: null });
  });

  it("describes the size of a single file", () => {
    expect(hints({ maxFiles: 1, maxFileSize: 10 * MiB }).limits).toBe(
      "Up to 10.0 MB.",
    );
  });

  it("describes the file count and the size of each file", () => {
    expect(hints({ maxFiles: 3, maxFileSize: 10 * MiB }).limits).toBe(
      "You can upload 3 files. Each up to 10.0 MB.",
    );
    expect(hints({ maxFiles: 3 }).limits).toBe("You can upload 3 files.");
  });

  it("lists the accepted types once each", () => {
    expect(
      hints({ maxFiles: 1, accept: ["image/png", ".jpg", ".jpeg", "video/*"] })
        .accept,
    ).toBe("Accepted PNG, JPEG, Videos.");
  });

  it("translates file type groups", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TranslationProvider
        translations={{ "Images(file type group)": "Bilder" }}
      >
        {children}
      </TranslationProvider>
    );
    const { result } = renderHook(
      () => useUploadHints({ maxFiles: 1, accept: ["image/*", ".pdf"] }),
      { wrapper },
    );
    expect(result.current.accept).toBe("Accepted Bilder, PDF.");
  });
});
