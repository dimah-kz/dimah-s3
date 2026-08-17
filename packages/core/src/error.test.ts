import { APIError } from "better-call/error";
import { describe, expect, it } from "vitest";
import {
  DimahS3Error,
  S3_ERROR_CODES,
  isAPIError,
  isDimahS3Error,
} from "./error";

describe("DimahS3Error", () => {
  it("uses the better-call (status, body) constructor", () => {
    const err = new DimahS3Error("BAD_REQUEST", { message: "bad request" });
    expect(err).toBeInstanceOf(APIError);
    expect(err).toMatchObject({
      name: "DimahS3Error",
      message: "bad request",
      status: "BAD_REQUEST",
      statusCode: 400,
    });
    expect(err.code).toBeUndefined();
    expect(err.body).toEqual({ message: "bad request" });
  });

  it("stores status, code, params, and cause on the APIError body", () => {
    const cause = new Error("root");
    const err = new DimahS3Error("BAD_REQUEST", {
      message: "name is required",
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      params: { name: "key" },
      cause,
    });

    expect(err).toMatchObject({
      status: "BAD_REQUEST",
      statusCode: 400,
      code: "VALIDATION_ERROR",
      params: { name: "key" },
    });
    expect(err.cause).toBe(cause);
    expect(err.body).toEqual({
      message: "name is required",
      code: "VALIDATION_ERROR",
      params: { name: "key" },
    });
  });

  it("fromStatus builds a DimahS3Error", () => {
    const err = DimahS3Error.fromStatus("FORBIDDEN", { message: "nope" });
    expect(err).toBeInstanceOf(DimahS3Error);
    expect(err.statusCode).toBe(403);
  });
});

describe("isAPIError / isDimahS3Error", () => {
  it("recognizes DimahS3Error, APIError, and duck-typed names", () => {
    const dimah = DimahS3Error.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN);
    const api = new APIError("UNAUTHORIZED", { message: "no" });

    expect(isDimahS3Error(dimah)).toBe(true);
    expect(isAPIError(dimah)).toBe(true);
    expect(isAPIError(api)).toBe(true);
    expect(isDimahS3Error(api)).toBe(false);
    expect(isAPIError({ name: "APIError" })).toBe(true);
    expect(isDimahS3Error({ name: "DimahS3Error" })).toBe(true);
    expect(isAPIError(new Error("x"))).toBe(false);
  });
});
