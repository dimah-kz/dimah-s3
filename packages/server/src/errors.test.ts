import { describe, expect, it } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";
import { errors, toDimahS3Error } from "./errors";

describe("errors", () => {
  it.each([
    ["notFound", 404, S3_ERROR_CODES.NOT_FOUND],
    ["invalidJson", 400, S3_ERROR_CODES.INVALID_JSON],
    ["forbidden", 403, S3_ERROR_CODES.FORBIDDEN],
    ["internalError", 500, S3_ERROR_CODES.INTERNAL_ERROR],
    ["objectNotFound", 404, S3_ERROR_CODES.OBJECT_NOT_FOUND],
    ["keyRequired", 400, S3_ERROR_CODES.KEY_REQUIRED],
    ["uploadIdRequired", 400, S3_ERROR_CODES.UPLOAD_ID_REQUIRED],
    ["partNumberInvalid", 400, S3_ERROR_CODES.PART_NUMBER_INVALID],
    ["partsRequired", 400, S3_ERROR_CODES.PARTS_REQUIRED],
    ["fileSizeRequiredUpload", 400, S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD],
    [
      "fileSizeRequiredMultipart",
      400,
      S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART,
    ],
  ] as const)("%s → %s / %s", (name, status, code) => {
    const err = errors[name]();
    expect(err).toMatchObject({ status, code });
  });

  it("interpolates field and network params", () => {
    expect(errors.fieldRequired("key")).toMatchObject({
      code: S3_ERROR_CODES.FIELD_REQUIRED,
      params: { name: "key" },
    });
    expect(errors.s3NetworkError("ECONNREFUSED")).toMatchObject({
      status: 502,
      code: S3_ERROR_CODES.S3_NETWORK_ERROR,
      params: { code: "ECONNREFUSED" },
    });
    expect(errors.validationError("bad")).toMatchObject({
      message: "bad",
      code: S3_ERROR_CODES.VALIDATION_ERROR,
    });
  });
});

describe("toDimahS3Error", () => {
  it("preserves DimahS3Error instances", () => {
    const original = new DimahS3Error("quota", 403, { code: "QUOTA" });
    expect(toDimahS3Error(original, "Forbidden", 403)).toBe(original);
  });

  it("keeps plain Error messages without stamping a library code", () => {
    const err = toDimahS3Error(new Error("Not enough quota"), "Forbidden", 403);
    expect(err).toMatchObject({
      message: "Not enough quota",
      status: 403,
      code: undefined,
    });
  });

  it("uses the fallback message when Error has no text", () => {
    const err = toDimahS3Error(new Error("  "), "Forbidden", 403, {
      code: S3_ERROR_CODES.FORBIDDEN,
    });
    expect(err.message).toBe("Forbidden");
    expect(err.code).toBe(S3_ERROR_CODES.FORBIDDEN);
  });
});
