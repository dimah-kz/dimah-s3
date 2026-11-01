import { createMiddleware } from "better-call";
import { toAPIError } from "@/helpers/error-boundary";
import { createLocals, runGuards } from "@/helpers/hooks";
import { syntheticRequest } from "@/helpers/request";
import type { S3EndpointContext } from "./context";
import { resolvedConfig, type RouterContext } from "./router-context";

/**
 * Adds `config`, `request` and `locals` to the endpoint context. With
 * `runGuards`, it also runs the instance guards (operation `"plugin"`) and
 * keeps the `locals` they return. It runs them once per call: when an
 * earlier middleware already did, it reuses that `locals`.
 */
function contextMiddleware(options: { runGuards: boolean }) {
  return createMiddleware(async (ctx): Promise<S3EndpointContext> => {
    const resolved = resolvedConfig(ctx.context);
    const injected = ctx.context as RouterContext & Partial<S3EndpointContext>;
    const { config } = injected;
    const request =
      ctx.request ?? syntheticRequest(resolved, { headers: ctx.headers });
    if (injected.locals) return { config, request, locals: injected.locals };

    const locals = createLocals();
    if (options.runGuards) {
      try {
        await runGuards(resolved.guard, {
          request,
          operation: "plugin",
          locals,
        });
      } catch (error) {
        throw toAPIError(error, resolved, request, "plugin");
      }
    }
    return { config, request, locals };
  });
}

/**
 * Context middleware of every plugin endpoint. Plugin endpoints are guarded
 * here; core endpoints run their guards inside the operation.
 */
export const s3ContextMiddleware = contextMiddleware({ runGuards: true });

/** Context middleware of the core endpoints, whose operations run the guards. */
export const coreContextMiddleware = contextMiddleware({ runGuards: false });

/**
 * Creates a middleware for plugin endpoints. Its handler sees the same
 * `ctx.context` as the endpoint (`config`, `request`, `locals`), and the
 * instance guards have already run.
 *
 * ```ts
 * const requireUser = createS3Middleware(async (ctx) => {
 *   if (!ctx.context.locals.userId) throw s3Error("UNAUTHORIZED");
 * });
 *
 * createS3Endpoint("/audit/recent", { method: "GET", use: [requireUser] }, handler);
 * ```
 */
export const createS3Middleware = createMiddleware.create({
  use: [s3ContextMiddleware],
});
