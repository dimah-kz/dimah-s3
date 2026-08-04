import { describe, expect, it, vi } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";
import { errors, toDimahS3Error } from "./errors";
import { runHook, runLifecycleHook, toErrorResponse } from "./internal-helpers";

describe("toDimahS3Error", () => {
  it("preserves DimahS3Error subclasses", () => {
    const original = new DimahS3Error("quota", 403, { code: "QUOTA" });
    expect(toDimahS3Error(original, "Forbidden", 403)).toBe(original);
  });

  it("keeps plain Error messages without stamping a library code", () => {
    const err = toDimahS3Error(new Error("Not enough quota"), "Forbidden", 403);
    expect(err.message).toBe("Not enough quota");
    expect(err.status).toBe(403);
    expect(err.code).toBeUndefined();
  });

  it("uses fallback message when Error has no message", () => {
    const err = toDimahS3Error(new Error("  "), "Forbidden", 403, {
      code: S3_ERROR_CODES.FORBIDDEN,
    });
    expect(err.message).toBe("Forbidden");
    expect(err.code).toBe(S3_ERROR_CODES.FORBIDDEN);
  });
});

describe("runHook", () => {
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
      status: 403,
      code: undefined,
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
      code: S3_ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error",
      status: 500,
    });
    spy.mockRestore();
  });
});

describe("toErrorResponse", () => {
  it("serializes DimahS3Error code and params", async () => {
    const res = toErrorResponse(errors.fieldRequired("key"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      message: "key is required",
      code: S3_ERROR_CODES.FIELD_REQUIRED,
      params: { name: "key" },
    });
  });

  it("does not leak unexpected Error messages", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse(new Error("AccessDenied: secret internals"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      message: "Internal server error",
      code: S3_ERROR_CODES.INTERNAL_ERROR,
    });
    spy.mockRestore();
  });

  it("maps network codes to S3_NETWORK_ERROR", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
    const res = toErrorResponse(err);
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      code: S3_ERROR_CODES.S3_NETWORK_ERROR,
      params: { code: "ECONNREFUSED" },
    });
    spy.mockRestore();
  });
});
