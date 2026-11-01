import {
  APIError as BetterCallAPIError,
  ValidationError,
} from "better-call/error";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  APIError,
  defineErrorCodes,
  formatErrorMessage,
  isAPIError,
  isS3ErrorCode,
  s3Error,
  S3_ERROR_CODES,
  type S3ClientErrorCode,
  type S3ErrorParams,
  type S3ErrorShape,
  type S3ServerErrorCode,
} from "./error";

const CLIENT_CODES = [
  "TOO_MANY_FILES",
  "HOOK_FAILED",
  "NETWORK_ERROR",
  "UPLOAD_FAILED",
  "DOWNLOAD_FAILED",
  "CHECKSUM_MISMATCH",
  "PARTIAL_FAILURE",
  "UNKNOWN_ERROR",
] as const;

describe("S3_ERROR_CODES", () => {
  const entries = Object.entries(S3_ERROR_CODES);

  it("tags every entry with its own code, a status, and a message", () => {
    for (const [key, entry] of entries) {
      expect(entry.code).toBe(key);
      expect(entry.status).toBeGreaterThanOrEqual(200);
      expect(entry.status).toBeLessThan(600);
      expect(entry.message).not.toBe("");
    }
  });

  it("flags exactly the client-only codes", () => {
    const flagged = entries
      .filter(([, entry]) => "client" in entry && entry.client)
      .map(([key]) => key);
    expect(flagged.sort()).toEqual([...CLIENT_CODES].sort());

    expectTypeOf<
      (typeof CLIENT_CODES)[number]
    >().toEqualTypeOf<S3ClientErrorCode>();
    expectTypeOf<"FORBIDDEN">().toExtend<S3ServerErrorCode>();
    expectTypeOf<"NETWORK_ERROR">().not.toExtend<S3ServerErrorCode>();
  });

  it("drops the renamed and removed 1.x codes", () => {
    for (const code of ["INVALID_KEY", "PAYLOAD_TOO_LARGE", "BLOCKED"]) {
      expect(Object.hasOwn(S3_ERROR_CODES, code)).toBe(false);
    }
    expect(S3_ERROR_CODES.QUOTA_EXCEEDED.status).toBe(403);
  });
});

describe("defineErrorCodes", () => {
  it("adds the key as code and keeps the entry fields", () => {
    const codes = defineErrorCodes({
      PLUGIN_LIMIT: { status: 429, message: "Slow down" },
    });
    expect(codes.PLUGIN_LIMIT).toEqual({
      code: "PLUGIN_LIMIT",
      status: 429,
      message: "Slow down",
    });
    expectTypeOf(codes.PLUGIN_LIMIT.code).toEqualTypeOf<"PLUGIN_LIMIT">();
  });
});

describe("formatErrorMessage", () => {
  it("fills placeholders from params", () => {
    expect(
      formatErrorMessage("{failed} of {total} operations failed", {
        failed: 2,
        total: 5,
      }),
    ).toBe("2 of 5 operations failed");
  });

  it("leaves placeholders without a param untouched", () => {
    expect(formatErrorMessage("Invalid request: {issue}")).toBe(
      "Invalid request: {issue}",
    );
    expect(formatErrorMessage("{a} and {toString}", { a: 1 })).toBe(
      "1 and {toString}",
    );
  });
});

describe("s3Error", () => {
  it("fills the template and sets status, code, and params", () => {
    const err = s3Error("FILE_TOO_LARGE", { size: 2048, maxFileSize: 1024 });

    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(BetterCallAPIError);
    expect(err).toMatchObject({
      name: "APIError",
      status: "PAYLOAD_TOO_LARGE",
      statusCode: 413,
      code: "FILE_TOO_LARGE",
      message: "File is 2048 bytes; the limit is 1024 bytes",
      params: { size: 2048, maxFileSize: 1024 },
    });
    expect(err.body).toEqual({
      code: "FILE_TOO_LARGE",
      message: "File is 2048 bytes; the limit is 1024 bytes",
      params: { size: 2048, maxFileSize: 1024 },
    });
  });

  it("omits params for codes without placeholders", () => {
    const err = s3Error("FORBIDDEN");
    expect(err.statusCode).toBe(403);
    expect(err.params).toBeUndefined();
    expect(err.body).toEqual({ code: "FORBIDDEN", message: "Forbidden" });
  });

  it("overrides the catalog status", () => {
    const err = s3Error("UPLOAD_FAILED", { status: 503 }, { status: 503 });
    expect(err.statusCode).toBe(503);
    expect(err.status).toBe("SERVICE_UNAVAILABLE");
    expect(err.message).toBe("Upload failed with HTTP 503");
  });

  it("keeps statuses without a better-call name numeric", () => {
    const err = s3Error("PARTIAL_FAILURE", { failed: 1, total: 3 });
    expect(err.status).toBe(207);
    expect(err.statusCode).toBe(207);
  });

  it("keeps the cause off the wire body", () => {
    const cause = new Error("root");
    const err = s3Error("INTERNAL_ERROR", undefined, { cause });
    expect(err.cause).toBe(cause);
    expect(err.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  });

  it("types params per code and fills only what it gets", () => {
    expectTypeOf<S3ErrorParams<"QUOTA_EXCEEDED">>().toEqualTypeOf<{
      limit: "bytes" | "files";
    }>();
    expectTypeOf<S3ErrorParams<"FORBIDDEN">>().toEqualTypeOf<undefined>();
    expectTypeOf<S3ErrorShape<"HOOK_FAILED">["params"]>().toEqualTypeOf<
      { hook: string } | undefined
    >();

    // @ts-expect-error FILE_TOO_LARGE requires params.
    const missing = s3Error("FILE_TOO_LARGE");
    // @ts-expect-error QUOTA_EXCEEDED.limit is "bytes" | "files".
    const wrongLimit = s3Error("QUOTA_EXCEEDED", { limit: "rows" });
    // @ts-expect-error FORBIDDEN takes no params.
    const extra = s3Error("FORBIDDEN", { reason: "x" });

    expect(missing.message).toBe(
      "File is {size} bytes; the limit is {maxFileSize} bytes",
    );
    expect(wrongLimit.params).toEqual({ limit: "rows" });
    expect(extra.message).toBe("Forbidden");
  });
});

describe("APIError", () => {
  it("uses the better-call (status, body) constructor", () => {
    const err = new APIError("BAD_REQUEST", {
      code: "PLUGIN_BAD",
      message: "bad request",
    });
    expect(err).toBeInstanceOf(BetterCallAPIError);
    expect(err).toMatchObject({
      name: "APIError",
      message: "bad request",
      status: "BAD_REQUEST",
      statusCode: 400,
      code: "PLUGIN_BAD",
    });
    expectTypeOf(err.code).toEqualTypeOf<string>();
  });

  it("from builds plugin-defined codes with an explicit status", () => {
    const err = APIError.from(429, {
      code: "PLUGIN_LIMIT",
      message: "Slow down",
      params: { retryAfter: 10 },
    });
    expect(err).toMatchObject({
      status: "TOO_MANY_REQUESTS",
      statusCode: 429,
      code: "PLUGIN_LIMIT",
      params: { retryAfter: 10 },
    });
  });

  it("fromShape uses the catalog status", () => {
    const err = APIError.fromShape({
      code: "OBJECT_NOT_FOUND",
      message: "Object not found",
    });
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("OBJECT_NOT_FOUND");
  });

  it("fromShape prefers an explicit status and keeps params", () => {
    const err = APIError.fromShape(
      {
        code: "FILE_TYPE_NOT_ALLOWED",
        message: 'File type "text/html" is not allowed',
        params: { type: "text/html", allowed: "image/png" },
      },
      422,
    );
    expect(err.statusCode).toBe(422);
    expect(err.params).toEqual({ type: "text/html", allowed: "image/png" });
  });

  it("fromShape falls back to 500 for unknown codes", () => {
    expect(
      APIError.fromShape({ code: "PLUGIN_ODD", message: "odd" }).statusCode,
    ).toBe(500);
    expect(
      APIError.fromShape({ code: "toString", message: "odd" }).statusCode,
    ).toBe(500);
  });
});

describe("isAPIError", () => {
  it("recognizes an APIError and a copy from another bundle of core", () => {
    const copy = Object.assign(new Error("no"), {
      name: "APIError",
      code: "FORBIDDEN",
      statusCode: 403,
    });

    expect(isAPIError(s3Error("FORBIDDEN"))).toBe(true);
    expect(isAPIError(copy)).toBe(true);
    expect(isAPIError(new Error("x"))).toBe(false);
    expect(isAPIError(null)).toBe(false);
  });

  it("does not claim errors that have no code getter", () => {
    // Narrowing would promise `code` and `params` they do not have.
    const raw = new BetterCallAPIError("UNAUTHORIZED", { message: "no" });
    expect(isAPIError(raw)).toBe(false);
    expect(isAPIError({ name: "APIError" })).toBe(false);
  });
});

describe("isS3ErrorCode", () => {
  it("matches and narrows the catalog code", () => {
    const err = s3Error("FORBIDDEN");
    expect(isS3ErrorCode(err, "FORBIDDEN")).toBe(true);
    expect(isS3ErrorCode(err, "NOT_FOUND")).toBe(false);
    expect(isS3ErrorCode(new Error("x"), "FORBIDDEN")).toBe(false);

    expectTypeOf(isS3ErrorCode<"FILE_TOO_LARGE">).guards.toEqualTypeOf<
      APIError & {
        code: "FILE_TOO_LARGE";
        params: { size: number; maxFileSize: number };
      }
    >();
  });

  it("does not match raw better-call errors", () => {
    const raw = new BetterCallAPIError("BAD_REQUEST", {
      code: "VALIDATION_ERROR",
      message: "Invalid request",
    });
    expect(isS3ErrorCode(raw, "VALIDATION_ERROR")).toBe(false);
    const validation = new ValidationError("Invalid body", []);
    expect(isS3ErrorCode(validation, "VALIDATION_ERROR")).toBe(false);
  });

  it("does not match a better-call error without a body", () => {
    expect(
      isS3ErrorCode(new BetterCallAPIError("FORBIDDEN"), "FORBIDDEN"),
    ).toBe(false);
  });
});
