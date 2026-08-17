import { describe, expect, it, vi } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import { errors } from "./errors";
import {
  normalizeExpiresIn,
  requestFromHeaders,
  runHook,
  runLifecycleHook,
} from "./internal-helpers";

describe("runHook", () => {
  it("is a no-op when the hook is omitted", async () => {
    await expect(
      runHook(undefined, { request: new Request("http://local") }),
    ).resolves.toBeUndefined();
  });

  it("rethrows DimahS3Error as-is", async () => {
    const thrown = errors.forbidden();
    await expect(
      runHook(
        async () => {
          throw thrown;
        },
        { request: new Request("http://local") },
      ),
    ).rejects.toBe(thrown);
  });

  it("wraps plain Errors without a FORBIDDEN code", async () => {
    await expect(
      runHook(
        async () => {
          throw new Error("Custom rejection");
        },
        { request: new Request("http://local") },
      ),
    ).rejects.toMatchObject({
      message: "Custom rejection",
      status: "FORBIDDEN",
      statusCode: 403,
      code: undefined,
    });
  });

  it("falls back to FORBIDDEN for empty messages", async () => {
    await expect(
      runHook(
        async () => {
          throw new Error("  ");
        },
        { request: new Request("http://local") },
      ),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.FORBIDDEN.code,
      status: "FORBIDDEN",
      statusCode: 403,
    });
  });
});

describe("runLifecycleHook", () => {
  it("maps unexpected failures to INTERNAL_ERROR", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runLifecycleHook(
        async () => {
          throw new Error("db write failed");
        },
        { request: new Request("http://local") },
      ),
    ).rejects.toMatchObject({
      code: S3_ERROR_CODES.INTERNAL_ERROR.code,
      message: "Internal server error",
      status: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    spy.mockRestore();
  });

  it("preserves DimahS3Error from lifecycle hooks", async () => {
    const thrown = errors.objectNotFound();
    await expect(
      runLifecycleHook(
        () => {
          throw thrown;
        },
        { request: new Request("http://local") },
      ),
    ).rejects.toBe(thrown);
  });
});

describe("normalizeExpiresIn", () => {
  it.each([
    [120, 120],
    ["90", 90],
    [1.8, 1],
    [0, 600],
    [-5, 600],
    [undefined, 600],
    ["nope", 600],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeExpiresIn(value)).toBe(expected);
  });
});

describe("requestFromHeaders", () => {
  it("builds a synthetic request", () => {
    const request = requestFromHeaders({ "x-user": "1" });
    expect(request.headers.get("x-user")).toBe("1");
    expect(request.url).toContain("dimah-s3.local");
  });
});
