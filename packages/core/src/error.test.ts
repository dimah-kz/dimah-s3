import { describe, expect, it } from "vitest";
import { DimahS3Error, S3_ERROR_CODES } from "./error";

describe("S3_ERROR_CODES", () => {
  it("exposes stable string codes", () => {
    expect(S3_ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
    expect(S3_ERROR_CODES.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
  });
});

describe("DimahS3Error", () => {
  it("defaults to status 400", () => {
    const err = new DimahS3Error("bad request");
    expect(err).toMatchObject({
      name: "DimahS3Error",
      message: "bad request",
      status: 400,
    });
    expect(err.code).toBeUndefined();
  });

  it("stores status, code, params, and cause", () => {
    const cause = new Error("root");
    const err = new DimahS3Error("name is required", 400, {
      cause,
      code: S3_ERROR_CODES.FIELD_REQUIRED,
      params: { name: "key" },
    });

    expect(err.status).toBe(400);
    expect(err.code).toBe("FIELD_REQUIRED");
    expect(err.params).toEqual({ name: "key" });
    expect(err.cause).toBe(cause);
  });
});
