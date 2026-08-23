import { describe, expect, it } from "vitest";
import { isAwsNotFound } from "./is-aws-not-found";

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
  });
});
