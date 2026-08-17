import { describe, expect, it } from "vitest";
import {
  S3_API_BASE_PATH,
  S3_API_ROUTES,
  normalizeS3ApiBasePath,
} from "./routes";

describe("normalizeS3ApiBasePath", () => {
  it.each([
    ["/api/s3/", "/api/s3"],
    ["/api/s3", "/api/s3"],
    ["/s3/", "/s3"],
  ])("strips a trailing slash from %s", (input, expected) => {
    expect(normalizeS3ApiBasePath(input)).toBe(expected);
  });
});

describe("S3_API_ROUTES", () => {
  it("freezes the default mount and relative paths (protocol SSOT)", () => {
    expect(S3_API_BASE_PATH).toBe("/api/s3");
    expect(S3_API_ROUTES).toEqual({
      upload: "/presign/upload",
      uploadConfirm: "/presign/upload/confirm",
      download: "/presign/download",
      delete: "/delete",
      multipartInit: "/presign/multipart/init",
      multipartPart: "/presign/multipart/part",
      multipartComplete: "/presign/multipart/complete",
      multipartAbort: "/presign/multipart/abort",
      multipartListParts: "/presign/multipart/parts",
    });
  });
});
