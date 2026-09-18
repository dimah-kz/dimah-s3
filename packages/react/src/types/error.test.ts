import { describe, expect, it } from "vitest";
import { APIError, S3_ERROR_CODES } from "@dimah-s3/core";
import { S3UploadError, toHookError, toUploadError } from "./error";

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

  it("is an Error with name and message", () => {
    const err: Error = new S3UploadError("failed", "HTTP_ERROR", 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: "S3UploadError", message: "failed" });
  });
});

describe("toUploadError", () => {
  it("returns S3UploadError as-is", () => {
    const err = new S3UploadError("failed", "HTTP_ERROR", 500);
    expect(toUploadError(err)).toBe(err);
  });

  it("preserves APIError code and does not wrap as API_ERROR", () => {
    const original = APIError.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN);
    expect(toUploadError(original, "presigning")).toBe(original);
  });

  it("wraps plain Errors", () => {
    const original = new Error("boom");
    const wrapped = toUploadError(original, "uploading");
    expect(wrapped).toMatchObject({
      name: "S3UploadError",
      code: "UPLOAD_ERROR",
      status: 500,
      message: "boom",
    });
    expect(wrapped.cause).toBe(original);
  });

  it("rethrows AbortError", () => {
    expect(() =>
      toUploadError(new DOMException("aborted", "AbortError")),
    ).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});

describe("toHookError", () => {
  it("preserves APIError", () => {
    const original = APIError.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN);
    expect(toHookError(original)).toBe(original);
  });

  it("wraps plain Errors as APIError", () => {
    const original = new Error("boom");
    const wrapped = toHookError(original);
    expect(wrapped).toMatchObject({
      name: "APIError",
      message: "boom",
    });
    expect(wrapped.cause).toBe(original);
  });
});
