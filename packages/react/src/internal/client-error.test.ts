import { describe, expect, it } from "vitest";
import { APIError, s3Error } from "@dimah-s3/core";
import { fakeS3Api } from "@/test/api";
import { requireApi, toClientError } from "./client-error";

/** A better-call error from another copy of the package: code only in `body`. */
function rawAPIError(statusCode: number, body: Record<string, unknown>) {
  return Object.assign(new Error("raw"), {
    name: "APIError",
    statusCode,
    body,
  });
}

describe("toClientError", () => {
  it("returns an APIError as-is", () => {
    const error = s3Error("FORBIDDEN");
    expect(toClientError(error)).toBe(error);
  });

  it("rebuilds a raw better-call error from its body", () => {
    const raw = rawAPIError(409, {
      code: "LOCKED_BY_PLUGIN",
      message: "Locked",
      params: { owner: "a" },
    });

    const error = toClientError(raw);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({
      code: "LOCKED_BY_PLUGIN",
      message: "Locked",
      params: { owner: "a" },
      statusCode: 409,
    });
    expect(error.cause).toBe(raw);
  });

  it("maps a raw better-call error without a code to UNKNOWN_ERROR", () => {
    const raw = rawAPIError(502, { message: "Bad" });

    const error = toClientError(raw);

    expect(error).toMatchObject({ code: "UNKNOWN_ERROR", statusCode: 502 });
    expect(error.cause).toBe(raw);
  });

  it("wraps anything else as UNKNOWN_ERROR with the cause", () => {
    const original = new Error("boom");

    const error = toClientError(original);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ code: "UNKNOWN_ERROR", statusCode: 500 });
    expect(error.cause).toBe(original);
  });
});

describe("requireApi", () => {
  it("returns the api, or throws a setup error naming the hook", () => {
    const api = fakeS3Api();
    expect(requireApi(api, "useDelete")).toBe(api);
    expect(() => requireApi(null, "useDelete")).toThrow(
      /Pass `api` to useDelete or wrap with <S3Provider>/,
    );
  });
});
