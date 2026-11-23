import { isS3ErrorCode } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import {
  awsStatus,
  isAwsNotFound,
  isAwsNotImplemented,
  isAwsPreconditionFailed,
  isAwsRangeNotSatisfiable,
  sendOrObjectNotFound,
} from "./aws-errors";

describe("isAwsNotFound", () => {
  it("detects common AWS not-found shapes", () => {
    expect(isAwsNotFound({ name: "NoSuchKey" })).toBe(true);
    expect(isAwsNotFound({ name: "NoSuchUpload" })).toBe(true);
    expect(isAwsNotFound({ Code: "NoSuchUpload" })).toBe(true);
    expect(isAwsNotFound({ Code: "NoSuchKey" })).toBe(true);
    expect(isAwsNotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isAwsNotFound(new Error("boom"))).toBe(false);
    expect(isAwsNotFound({ name: "AccessDenied" })).toBe(false);
    expect(isAwsNotFound({ $metadata: { httpStatusCode: 403 } })).toBe(false);
    expect(isAwsNotFound(null)).toBe(false);
    expect(
      isAwsNotFound({
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(false);
    expect(
      isAwsNotFound({
        Code: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(false);
    expect(isAwsNotFound("NoSuchKey")).toBe(false);
  });
});

describe("status checks", () => {
  it("match by name, Code, or HTTP status", () => {
    expect(isAwsPreconditionFailed({ name: "PreconditionFailed" })).toBe(true);
    expect(
      isAwsPreconditionFailed({ $metadata: { httpStatusCode: 412 } }),
    ).toBe(true);
    expect(isAwsNotImplemented({ Code: "NotImplemented" })).toBe(true);
    expect(isAwsNotImplemented({ $metadata: { httpStatusCode: 501 } })).toBe(
      true,
    );
    expect(isAwsRangeNotSatisfiable({ name: "InvalidRange" })).toBe(true);
    expect(
      isAwsRangeNotSatisfiable({ $metadata: { httpStatusCode: 416 } }),
    ).toBe(true);
    expect(isAwsPreconditionFailed({ name: "NotImplemented" })).toBe(false);
  });

  it("awsStatus reads a numeric status only", () => {
    expect(awsStatus({ $metadata: { httpStatusCode: 304 } })).toBe(304);
    expect(awsStatus({ $metadata: { httpStatusCode: "304" } })).toBeUndefined();
    expect(awsStatus(undefined)).toBeUndefined();
  });
});

describe("sendOrObjectNotFound", () => {
  it("maps a not-found error to OBJECT_NOT_FOUND with the cause", async () => {
    const cause = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    const error: unknown = await sendOrObjectNotFound(() =>
      Promise.reject(cause),
    ).catch((thrown: unknown) => thrown);

    expect(isS3ErrorCode(error, "OBJECT_NOT_FOUND")).toBe(true);
    expect((error as Error).cause).toBe(cause);
  });

  it("rethrows anything else as it is", async () => {
    const cause = new Error("boom");
    await expect(
      sendOrObjectNotFound(() => Promise.reject(cause)),
    ).rejects.toBe(cause);
  });
});
