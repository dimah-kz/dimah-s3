import type { S3ClientPlugin } from "./types";

/**
 * Identity helper that preserves literal `id` and method types for
 * {@link createS3Client} inference (`api[id]`).
 *
 * ```ts
 * export function dbClient() {
 *   return defineClientPlugin({
 *     id: "db",
 *     $InferServerPlugin: {} as ReturnType<typeof db>,
 *     getActions: ($fetch) => ({
 *       listObjects: () => $fetch("/db/objects", { method: "GET" }),
 *     }),
 *   });
 * }
 * ```
 */
export function defineClientPlugin<
  Id extends string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
>(plugin: S3ClientPlugin<Id, TMethods>): S3ClientPlugin<Id, TMethods> {
  return plugin;
}
