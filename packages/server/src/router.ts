import { createRouter, type Endpoint } from "better-call";
import { normalizeS3ApiBasePath, S3_API_BASE_PATH } from "@dimah-s3/core";
import { errors, type ServerErrors } from "./errors";
import { toErrorResponse } from "./internal-helpers";
import { bindEndpoints } from "./api/bind-endpoints";
import type { DimahS3Config } from "./types";

function withJsonErrors(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const response = await handler(request);
    if (response.status !== 404 && response.status !== 500) {
      return response;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response;
    }
    return toErrorResponse(
      response.status === 404 ? errors.notFound() : errors.internalError(),
    );
  };
}

/**
 * better-call router with dimah-s3 error JSON, guard context, and OpenAPI off.
 */
export function createS3Router<E extends Record<string, Endpoint>>(
  endpoints: E,
  env: { config: DimahS3Config; errors: ServerErrors },
) {
  const basePath = normalizeS3ApiBasePath(
    env.config.basePath ?? S3_API_BASE_PATH,
  );

  const router = createRouter(endpoints, {
    basePath,
    routerContext: { config: env.config, errors: env.errors },
    openapi: { disabled: true },
    onError: (error) => toErrorResponse(error),
  });

  return {
    endpoints: bindEndpoints(router.endpoints, env),
    handler: withJsonErrors(router.handler),
  };
}
