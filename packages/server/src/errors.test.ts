import { describe, expect, it } from "vitest";
import { APIError, S3_ERROR_CODES } from "@dimah-s3/core";
import { errors } from "./errors";

describe("errors", () => {
  it.each([
    ["notFound", 404, S3_ERROR_CODES.NOT_FOUND.code],
    ["unauthorized", 401, S3_ERROR_CODES.UNAUTHORIZED.code],
    ["forbidden", 403, S3_ERROR_CODES.FORBIDDEN.code],
    ["conflict", 409, S3_ERROR_CODES.CONFLICT.code],
    ["internalError", 500, S3_ERROR_CODES.INTERNAL_ERROR.code],
    ["objectNotFound", 404, S3_ERROR_CODES.OBJECT_NOT_FOUND.code],
    ["payloadTooLarge", 413, S3_ERROR_CODES.PAYLOAD_TOO_LARGE.code],
  ] as const)("%s → %s / %s", (name, statusCode, code) => {
    const err = errors[name]();
    expect(err).toBeInstanceOf(APIError);
    expect(err).toMatchObject({ statusCode, code });
  });

  it("interpolates network params", () => {
    expect(errors.s3NetworkError("ECONNREFUSED")).toMatchObject({
      status: "BAD_GATEWAY",
      statusCode: 502,
      code: S3_ERROR_CODES.S3_NETWORK_ERROR.code,
      params: { code: "ECONNREFUSED" },
    });
    expect(errors.validationError("bad")).toMatchObject({
      message: "bad",
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
    });
  });

  it("interpolates missing multipart part numbers", () => {
    expect(errors.multipartPartMissing(3)).toMatchObject({
      statusCode: 400,
      code: S3_ERROR_CODES.MULTIPART_PART_MISSING.code,
      params: { partNumber: 3 },
      message: "Uploaded part 3 was not found",
    });
  });
});
