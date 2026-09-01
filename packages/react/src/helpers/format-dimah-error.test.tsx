import { describe, expect, it } from "vitest";
import { APIError, S3_ERROR_CODES } from "@dimah-s3/core";
import { useFormatDimahError } from "./format-dimah-error";
import { renderHookWithI18n } from "@/test/render-hook";

describe("useFormatDimahError", () => {
  it("maps coded errors to English source strings", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(APIError.from("NOT_FOUND", S3_ERROR_CODES.OBJECT_NOT_FOUND)),
    ).toBe("File not found");
    expect(
      format(
        APIError.from("PAYLOAD_TOO_LARGE", S3_ERROR_CODES.PAYLOAD_TOO_LARGE),
      ),
    ).toBe("File is too large");
  });

  it("interpolates params", () => {
    const format = renderHookWithI18n(useFormatDimahError);
    expect(
      format(
        APIError.from("BAD_GATEWAY", {
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
        APIError.from("NOT_FOUND", {
          ...S3_ERROR_CODES.FEATURE_DISABLED,
          params: { feature: "download" },
        }),
      ),
    ).toBe("download is disabled");
    expect(
      format(APIError.from("BAD_REQUEST", S3_ERROR_CODES.INVALID_KEY)),
    ).toBe("Object key is invalid");
    expect(
      format(APIError.from("NOT_FOUND", S3_ERROR_CODES.UNKNOWN_ROUTE)),
    ).toBe("Unknown file route");
    expect(
      format(
        APIError.from("BAD_REQUEST", S3_ERROR_CODES.FILE_TYPE_NOT_ALLOWED),
      ),
    ).toBe("File type is not allowed");
    expect(
      format(
        APIError.from("BAD_REQUEST", {
          ...S3_ERROR_CODES.MULTIPART_PART_MISSING,
          params: { partNumber: 3 },
        }),
      ),
    ).toBe("Uploaded part 3 was not found");
    expect(
      format(
        new APIError("BAD_REQUEST", {
          message: "custom",
          code: "CUSTOM",
        }),
      ),
    ).toBe("custom");
  });
});
