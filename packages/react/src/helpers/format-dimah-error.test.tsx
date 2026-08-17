import { describe, expect, it } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";
import { useFormatDimahError } from "./format-dimah-error";
import { renderHookWithI18n } from "../test/render-hook";

describe("useFormatDimahError", () => {
  it("maps coded errors to English source strings", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(DimahS3Error.from("NOT_FOUND", S3_ERROR_CODES.OBJECT_NOT_FOUND)),
    ).toBe("File not found");
  });

  it("interpolates params", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(
        DimahS3Error.from("BAD_GATEWAY", {
          ...S3_ERROR_CODES.S3_NETWORK_ERROR,
          params: { code: "ECONNREFUSED" },
        }),
      ),
    ).toBe("Could not reach storage (ECONNREFUSED)");
  });

  it("falls back for unknown errors and unknown codes", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(format(new Error("boom"))).toBe("boom");
    expect(format("x")).toBe("Unknown error");
    expect(
      format(
        new DimahS3Error("BAD_REQUEST", {
          message: "custom",
          code: "CUSTOM",
        }),
      ),
    ).toBe("custom");
  });
});
