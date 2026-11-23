import type { S3ErrorCatalog } from "@dimah-s3/core";
import type { Endpoint } from "better-call";
import type { DimahS3Plugin } from "./types";

/**
 * Identity helper that keeps the plugin's types: the literal `id`, the
 * `context` on `s3.context[id]` and `s3[id]`, the `endpoints` a client
 * plugin's `$fetch` is typed by, and the `$ERROR_CODES` merged into
 * `s3.$ERROR_CODES`.
 *
 * ```ts
 * export const audit = definePlugin({
 *   id: "audit",
 *   hooks: { upload: { onConfirmed: ({ key }) => log(key) } },
 *   context: { log },
 * });
 * ```
 */
export function definePlugin<
  Id extends string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEndpoints extends Record<string, Endpoint> = Record<never, never>,
  TErrorCodes extends S3ErrorCatalog = Record<never, never>,
>(
  plugin: DimahS3Plugin<Id, TContext, TEndpoints, TErrorCodes>,
): DimahS3Plugin<Id, TContext, TEndpoints, TErrorCodes> {
  return plugin;
}
