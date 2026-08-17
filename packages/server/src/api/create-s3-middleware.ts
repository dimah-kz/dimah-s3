import { createMiddleware } from "better-call";
import { requestFromHeaders, runHook } from "../internal-helpers";
import type { S3EndpointContext } from "./context";

/**
 * Injects `config` / `request` and runs the global `guard`.
 * Used by {@link createS3Endpoint} so HTTP and `s3.api` share the same path.
 */
export const s3ContextMiddleware = createMiddleware(async (ctx) => {
  const injected = ctx.context as Partial<S3EndpointContext> | undefined;
  if (!injected?.config) {
    throw new Error(
      "createS3Endpoint requires dimahS3 router context. Call endpoints through dimahS3().api or the HTTP handler.",
    );
  }

  const request =
    ctx.request ??
    injected.request ??
    requestFromHeaders(ctx.headers as HeadersInit | undefined);

  await runHook(injected.config.guard, { request });

  return {
    config: injected.config,
    request,
  } satisfies S3EndpointContext;
});

/**
 * Middleware factory with dimah-s3 context already applied — same idea as
 * Better Auth `createAuthMiddleware`.
 */
export const createS3Middleware = createMiddleware.create({
  use: [s3ContextMiddleware],
});
