import { createRouter, toResponse, type Endpoint } from "better-call";
import {
  isAPIError,
  normalizeS3ApiBasePath,
  S3_API_BASE_PATH,
} from "@dimah-s3/core";
import { errors } from "@/errors";
import { resolveLogger } from "@/helpers/logger";
import { bindEndpoints } from "./bind-endpoints";
import type { ResolvedDimahS3Config } from "@/types";

const NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

/**
 * better-call `onError`: `APIError` serializes natively. Unknown throws
 * become INTERNAL_ERROR / S3_NETWORK_ERROR.
 */
function onS3RouterError(error: unknown, config?: ResolvedDimahS3Config): void {
  if (isAPIError(error)) return;

  const code = (error as { code?: string })?.code;
  const logger = resolveLogger(config?.logger);
  if (typeof code === "string" && NETWORK_CODES.has(code)) {
    const networkErr = errors.s3NetworkError(code);
    logger.error?.(networkErr.message, error);
    config?.onError?.(error, {});
    throw networkErr;
  }

  logger.error?.(error instanceof Error ? error.message : String(error), error);
  config?.onError?.(error, {});
  throw errors.internalError();
}

/**
 * Unmatched routes never hit `onError` — better-call returns an empty 404.
 * Re-serialize those as APIError JSON. JSON 404s from endpoints pass through.
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
 * Internal better-call router with dimah-s3 context, OpenAPI off, and native
 * APIError JSON. Not part of the public package surface.
 */
export function createS3Router<E extends Record<string, Endpoint>>(
  endpoints: E,
  env: { config: ResolvedDimahS3Config },
) {
  const basePath = normalizeS3ApiBasePath(
    env.config.basePath ?? S3_API_BASE_PATH,
  );

  const router = createRouter(endpoints, {
    basePath,
    routerContext: { config: env.config },
    openapi: { disabled: true },
    onError: (error) => onS3RouterError(error, env.config),
  });

  return {
    endpoints: bindEndpoints(router.endpoints, { config: env.config }),
    handler: withUnmatchedRouteJson(router.handler),
  };
}
