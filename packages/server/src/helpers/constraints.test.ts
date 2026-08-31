import { describe, expect, it } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import {
  assertDeclaredConstraints,
  assertVerifiedConstraints,
  assertWithinMaxFileSize,
} from "./constraints";

describe("assertWithinMaxFileSize", () => {
  it("allows omitted max and sizes at the cap", () => {
    expect(() => assertWithinMaxFileSize(undefined, 999)).not.toThrow();
    expect(() => assertWithinMaxFileSize(10, 10)).not.toThrow();
    expect(() => assertWithinMaxFileSize(10, 0)).not.toThrow();
  });

  it("rejects over the cap", () => {
    try {
      assertWithinMaxFileSize(10, 11);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
      });
    }
  });

  it("treats maxFileSize 0 as a hard cap", () => {
    try {
      assertWithinMaxFileSize(0, 1);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
      });
    }
  });
});

describe("assertDeclaredConstraints", () => {
  it("rejects a declared size over maxFileSize", () => {
    try {
      assertDeclaredConstraints(
        { maxFileSize: 5 },
        { fileName: "a.bin", fileSize: 10 },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
      });
    }
  });
});

describe("assertVerifiedConstraints", () => {
  it("rejects HeadObject size over maxFileSize", () => {
    try {
      assertVerifiedConstraints(
        { maxFileSize: 20 },
        { contentLength: 100, contentType: "image/png", fileName: "a.png" },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code,
      });
    }
  });
});
