import { describe, expect, it } from "vitest";
import { useFormatValidateFileError } from "./format-validate-file-error";
import { renderHookWithI18n } from "@/test/render-hook";

describe("useFormatValidateFileError", () => {
  it("maps validation codes to English source strings", () => {
    const format = renderHookWithI18n(useFormatValidateFileError);
    expect(
      format({
        code: "FILE_TYPE_NOT_ALLOWED",
        message: "ignored",
        params: { type: ".exe" },
      }),
    ).toBe('File type ".exe" is not allowed');
    expect(format({ code: "FILE_EMPTY", message: "ignored" })).toBe(
      "File is empty",
    );
    expect(
      format({
        code: "FILE_TOO_LARGE",
        message: "ignored",
        params: { size: "2.0 MB" },
      }),
    ).toBe("File size exceeds 2.0 MB limit");
  });
});
