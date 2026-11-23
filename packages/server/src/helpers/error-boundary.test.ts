import { APIError, s3Error } from "@dimah-s3/core";
import {
  APIError as BetterCallAPIError,
  ValidationError,
} from "better-call/error";
import { describe, expect, it, vi } from "vitest";
import { ConfigError, toAPIError } from "./error-boundary";

function setup() {
  const error = vi.fn();
  const onError = vi.fn();
  const request = new Request("http://localhost/api/s3/presign/upload");
  return { env: { logger: { error }, onError }, error, onError, request };
}

describe("toAPIError", () => {
  it("passes an APIError through without logging", () => {
    const { env, error, onError, request } = setup();
    const thrown = s3Error("FORBIDDEN");
    expect(toAPIError(thrown, env, request)).toBe(thrown);
    expect(error).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("maps a plain Error to INTERNAL_ERROR, logs it and calls onError", () => {
    const { env, error, onError, request } = setup();
    const thrown = new Error("db down");
    const result = toAPIError(thrown, env, request);

    expect(result).toBeInstanceOf(APIError);
    expect(result).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      statusCode: 500,
      cause: thrown,
    });
    expect(result.body).not.toHaveProperty("cause");
    expect(error).toHaveBeenCalledWith("db down", thrown);
    expect(onError).toHaveBeenCalledWith(thrown, {
      request,
      operation: undefined,
    });
  });

  it("passes the operation to onError", () => {
    const { env, onError, request } = setup();
    toAPIError(new Error("db down"), env, request, "confirm");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      request,
      operation: "confirm",
    });
  });

  it("logs a rejected async onError instead of leaving it unhandled", async () => {
    const error = vi.fn();
    const hookError = new Error("sentry down");
    const request = new Request("http://localhost/api/s3/presign/upload");
    const env = {
      logger: { error },
      onError: async () => {
        throw hookError;
      },
    };

    toAPIError(new Error("db down"), env, request);

    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith("onError threw", hookError),
    );
  });

  it("does not pass through another library's error named APIError", () => {
    const { env, error, request } = setup();
    const foreign = Object.assign(new Error("rate limited"), {
      name: "APIError",
      status: 429,
    });

    expect(toAPIError(foreign, env, request)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith("rate limited", foreign);
  });

  it("maps a thrown non-Error value", () => {
    const { env, error, request } = setup();
    expect(toAPIError("nope", env, request)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith("nope", "nope");
  });

  it("logs a ConfigError as a config error", () => {
    const { env, error, request } = setup();
    const thrown = new ConfigError("guard returned true");
    expect(toAPIError(thrown, env, request)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith(
      "Config error: guard returned true",
      thrown,
    );
  });

  it.each([
    [
      "on the error",
      Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
    ],
    [
      "on its cause",
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("dns"), { code: "ENOTFOUND" }),
      }),
    ],
  ])("maps a socket error code %s to S3_NETWORK_ERROR", (_, thrown) => {
    const { env, error, onError, request } = setup();
    const result = toAPIError(thrown, env, request);
    expect(result).toMatchObject({
      code: "S3_NETWORK_ERROR",
      statusCode: 502,
    });
    expect(result.params?.code).toMatch(/^E/);
    expect(error).toHaveBeenCalledWith(result.message, thrown);
    expect(onError).toHaveBeenCalledWith(thrown, {
      request,
      operation: undefined,
    });
  });

  it("does not log when the client already disconnected", () => {
    const { env, error, onError } = setup();
    const controller = new AbortController();
    const request = new Request("http://localhost", {
      signal: controller.signal,
    });
    controller.abort();
    expect(toAPIError(new Error("aborted"), env, request)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("logs a throwing onError and still returns INTERNAL_ERROR", () => {
    const { env, error, request } = setup();
    const hookError = new Error("reporter down");
    env.onError.mockImplementation(() => {
      throw hookError;
    });
    expect(toAPIError(new Error("boom"), env, request)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith("onError threw", hookError);
  });

  it("works with a logger that has no methods", () => {
    const { request } = setup();
    expect(
      toAPIError(new Error("boom"), { logger: {} }, request),
    ).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  describe("raw better-call errors", () => {
    it("maps an unsupported media type to UNSUPPORTED_MEDIA_TYPE", () => {
      const { env, request } = setup();
      const thrown = new BetterCallAPIError(415, {
        message: 'Content-Type "text/plain" is not allowed.',
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
      expect(toAPIError(thrown, env, request)).toMatchObject({
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Request body must be application/json",
        statusCode: 415,
      });
    });

    it.each([
      [
        "invalid JSON",
        new BetterCallAPIError(400, {
          message: "Invalid JSON in request body",
          code: "BAD_REQUEST",
        }),
        "Invalid JSON in request body",
      ],
      [
        "a validation error",
        new ValidationError("[body.route] Required", []),
        "[body.route] Required",
      ],
    ])("maps %s to VALIDATION_ERROR", (_, thrown, issue) => {
      const { env, request } = setup();
      expect(toAPIError(thrown, env, request)).toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        params: { issue },
      });
    });

    it("keeps a plugin code, message, params and headers", () => {
      const { env, request } = setup();
      const thrown = new BetterCallAPIError(
        429,
        { code: "AUDIT_RATE_LIMITED", message: "Slow down", params: { n: 1 } },
        { "retry-after": "5" },
      );
      const result = toAPIError(thrown, env, request);
      expect(result).toBeInstanceOf(APIError);
      expect(result).toMatchObject({
        code: "AUDIT_RATE_LIMITED",
        message: "Slow down",
        params: { n: 1 },
        statusCode: 429,
      });
      expect(new Headers(result.headers).get("retry-after")).toBe("5");
    });

    it("names a code from the status when the body has none", () => {
      const { env, request } = setup();
      expect(
        toAPIError(
          new BetterCallAPIError("FORBIDDEN", { message: "Nope" }),
          env,
          request,
        ),
      ).toMatchObject({ code: "FORBIDDEN", message: "Nope", statusCode: 403 });
      expect(
        toAPIError(new BetterCallAPIError(500), env, request),
      ).toMatchObject({ code: "INTERNAL_ERROR", statusCode: 500 });
    });
  });
});
