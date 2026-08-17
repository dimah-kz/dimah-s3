import { createRouter, toResponse, type Endpoint } from "better-call";
import {
  isAPIError,
  normalizeS3ApiBasePath,
  S3_API_BASE_PATH,
} from "@dimah-s3/core";
import { errors } from "./errors";
import { bindEndpoints } from "./api/bind-endpoints";
import type { DimahS3Config } from "./types";

const NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

/**
 * better-call `onError`: APIError (including DimahS3Error) serializes
 * natively. Unknown throws become INTERNAL_ERROR / S3_NETWORK_ERROR.
 */
function onS3RouterError(error: unknown): void {
  if (isAPIError(error)) return;

  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && NETWORK_CODES.has(code)) {
    const networkErr = errors.s3NetworkError(code);
    console.error("[S3 API]", networkErr.message, error);
    throw networkErr;
  }

  console.error("[S3 API]", error);
  throw errors.internalError();
}

/**
 * Unmatched routes never hit `onError` — better-call returns an empty 404.
 * Re-serialize those as DimahS3Error JSON. JSON 404s from endpoints pass through.
 */
function withUnmatchedRouteJson(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const response = await handler(request);
    if (response.status !== 404) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response;
    return toResponse(errors.notFound());
  };
}

/**
 * better-call router with dimah-s3 context, OpenAPI off, and native APIError JSON.
 */
export function createS3Router<E extends Record<string, Endpoint>>(
  endpoints: E,
  env: { config: DimahS3Config },
) {
  const basePath = normalizeS3ApiBasePath(
    env.config.basePath ?? S3_API_BASE_PATH,
  );

  const router = createRouter(endpoints, {
    basePath,
    routerContext: { config: env.config },
    openapi: { disabled: true },
    onError: onS3RouterError,
  });

  return {
    endpoints: bindEndpoints(router.endpoints, { config: env.config }),
    handler: withUnmatchedRouteJson(router.handler),
  };
}
