import { APIError } from "better-call/error";
import { describe, expect, it } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "./error";

describe("DimahS3Error", () => {
  it("defaults to status 400 without a code", () => {
    const err = new DimahS3Error("bad request");
    expect(err).toBeInstanceOf(APIError);
    expect(err).toMatchObject({
      name: "DimahS3Error",
      message: "bad request",
      status: 400,
      statusCode: 400,
    });
    expect(err.code).toBeUndefined();
    expect(err.body).toEqual({ message: "bad request" });
  });

  it("stores status, code, params, and cause on the APIError body", () => {
    const cause = new Error("root");
    const err = new DimahS3Error("name is required", 400, {
      cause,
      code: S3_ERROR_CODES.FIELD_REQUIRED,
      params: { name: "key" },
    });

    expect(err).toMatchObject({
      status: 400,
      statusCode: 400,
      code: "FIELD_REQUIRED",
      params: { name: "key" },
    });
    expect(err.cause).toBe(cause);
    expect(err.body).toEqual({
      message: "name is required",
      code: "FIELD_REQUIRED",
      params: { name: "key" },
    });
  });
});
