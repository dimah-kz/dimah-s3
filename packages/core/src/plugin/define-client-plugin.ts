import type { S3ErrorCatalog } from "@/error-codes";
import type { S3ClientPlugin } from "./types";

/**
 * Identity helper that preserves literal `id` and method types for
 * {@link createS3Client} inference (`api[id]`).
 *
 * With `$InferServerPlugin`, the `$fetch` that `getActions` receives is
 * typed by the server plugin's endpoints: the path and method pick one, its
 * schema types `query` and `body`, and the result is what its handler
 * returns. A path or method the server does not serve fails to compile.
 *
 * ```ts
 * export function auditClient() {
 *   return defineClientPlugin({
 *     id: "audit",
 *     $InferServerPlugin: {} as ReturnType<typeof audit>,
 *     $ERROR_CODES: AUDIT_ERROR_CODES,
 *     getActions: ($fetch) => ({
 *       listEvents: (query?: { limit?: number }) =>
 *         $fetch("/audit/events", { method: "GET", query }),
 *     }),
 *   });
 * }
 * ```
 */
export function defineClientPlugin<
  Id extends string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
  TServer extends { id: Id } = { id: Id },
  TErrorCodes extends S3ErrorCatalog = Record<never, never>,
>(
  plugin: S3ClientPlugin<Id, TMethods, TServer, TErrorCodes>,
): S3ClientPlugin<Id, TMethods, TServer, TErrorCodes> {
  return plugin;
}
