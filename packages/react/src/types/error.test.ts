import { describe, expect, it } from "vitest";
import { DimahS3Error } from "@dimah-s3/core";
import { S3UploadError, toUploadError } from "./error";

describe("S3UploadError", () => {
  it("exposes statusCode as an alias of status", () => {
    const err = new S3UploadError("failed", "HTTP_ERROR", 502, "uploading");
    expect(err).toMatchObject({
      name: "S3UploadError",
      code: "HTTP_ERROR",
      status: 502,
      phase: "uploading",
    });
    expect(err.statusCode).toBe(502);
  });
});

describe("toUploadError", () => {
  it("returns S3UploadError as-is", () => {
    const err = new S3UploadError("failed", "HTTP_ERROR", 500);
    expect(toUploadError(err)).toBe(err);
  });

  it("wraps DimahS3Error as API_ERROR", () => {
    const wrapped = toUploadError(
      new DimahS3Error("blocked", 403),
      "presigning",
    );
    expect(wrapped).toMatchObject({
      code: "API_ERROR",
      status: 403,
      phase: "presigning",
      message: "blocked",
    });
  });

  it("wraps plain Errors", () => {
    expect(toUploadError(new Error("boom"), "uploading")).toMatchObject({
      code: "UPLOAD_ERROR",
      status: 500,
      message: "boom",
    });
  });

  it("rethrows AbortError", () => {
    expect(() =>
      toUploadError(new DOMException("aborted", "AbortError")),
    ).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});
