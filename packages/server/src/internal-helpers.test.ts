import { APIError, ValidationError } from "better-call";
import { describe, expect, it, vi } from "vitest";
import { S3_ERROR_CODES } from "@dimah-s3/core";
import { errors } from "./errors";
import {
  dimahS3ErrorFromCaught,
  normalizeExpiresIn,
  requestFromHeaders,
  runHook,
  runLifecycleHook,
  toErrorResponse,
} from "./internal-helpers";

describe("dimahS3ErrorFromCaught", () => {
  it("maps ValidationError to VALIDATION_ERROR", () => {
    const err = dimahS3ErrorFromCaught(new ValidationError("key required", []));
    expect(err).toMatchObject({
      status: 400,
      code: S3_ERROR_CODES.VALIDATION_ERROR,
      message: "key required",
    });
  });

  it("maps APIError status and body code", () => {
    const err = dimahS3ErrorFromCaught(
      new APIError(404, { message: "gone", code: S3_ERROR_CODES.NOT_FOUND }),
    );
    expect(err).toMatchObject({
      status: 404,
      code: S3_ERROR_CODES.NOT_FOUND,
      message: "gone",
    });
  });

  it("returns undefined for unknown throws", () => {
    expect(dimahS3ErrorFromCaught(new Error("boom"))).toBeUndefined();
  });
});

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
      status: 403,
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
      code: S3_ERROR_CODES.FORBIDDEN,
      status: 403,
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
