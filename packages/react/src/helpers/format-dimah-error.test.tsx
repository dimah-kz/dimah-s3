import { describe, expect, it } from "vitest";
import { DimahS3Error } from "@dimah-s3/core";
import { useFormatDimahError } from "./format-dimah-error";
import { renderHookWithI18n } from "../test/render-hook";

describe("useFormatDimahError", () => {
  it("maps coded errors to English source strings", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(new DimahS3Error("ignored", 400, { code: "KEY_REQUIRED" })),
    ).toBe("Object key is required");
  });

  it("interpolates params", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(
        new DimahS3Error("ignored", 400, {
          code: "FIELD_REQUIRED",
          params: { name: "uploadId" },
        }),
      ),
    ).toBe("uploadId is required");
  });

  it("falls back for unknown errors and unknown codes", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(format(new Error("boom"))).toBe("boom");
    expect(format("x")).toBe("Unknown error");
    expect(format(new DimahS3Error("custom", 400, { code: "CUSTOM" }))).toBe(
      "custom",
    );
  });
});
