import { APIError as BetterCallAPIError } from "better-call/error";
import { describe, expect, it } from "vitest";
import { APIError, S3_ERROR_CODES, isAPIError, isS3ErrorCode } from "./error";

describe("APIError", () => {
  it("uses the better-call (status, body) constructor", () => {
    const err = new APIError("BAD_REQUEST", { message: "bad request" });
    expect(err).toBeInstanceOf(BetterCallAPIError);
    expect(err).toMatchObject({
      name: "APIError",
      message: "bad request",
      status: "BAD_REQUEST",
      statusCode: 400,
    });
    expect(err.code).toBeUndefined();
    expect(err.body).toEqual({ message: "bad request" });
  });

  it("stores status, code, params, and cause on the APIError body", () => {
    const cause = new Error("root");
    const err = new APIError("BAD_REQUEST", {
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

  it("fromStatus builds an APIError", () => {
    const err = APIError.fromStatus("FORBIDDEN", { message: "nope" });
    expect(err).toBeInstanceOf(APIError);
    expect(err.statusCode).toBe(403);
  });
});

describe("isAPIError", () => {
  it("recognizes APIError, better-call copies, and duck-typed names", () => {
    const ours = APIError.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN);
    const base = new BetterCallAPIError("UNAUTHORIZED", { message: "no" });

    expect(isAPIError(ours)).toBe(true);
    expect(isAPIError(base)).toBe(true);
    expect(isAPIError({ name: "APIError" })).toBe(true);
    expect(isAPIError(new Error("x"))).toBe(false);
  });

  it("narrows catalog codes with isS3ErrorCode", () => {
    const err = APIError.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN);
    expect(isS3ErrorCode(err, "FORBIDDEN")).toBe(true);
    expect(isS3ErrorCode(err, "NOT_FOUND")).toBe(false);
    expect(isS3ErrorCode(new Error("x"), "FORBIDDEN")).toBe(false);
  });
});
