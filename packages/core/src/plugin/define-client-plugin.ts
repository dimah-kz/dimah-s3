import type { S3ClientPlugin } from "./types";

/**
 * Identity helper that preserves literal `id` and method types for
 * {@link createS3Client} inference (`api[id]`).
 *
 * `$InferServerPlugin` must share the same `id` as the client plugin.
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
  TServer extends { id: Id } = { id: Id },
>(
  plugin: S3ClientPlugin<Id, TMethods, TServer>,
): S3ClientPlugin<Id, TMethods, TServer> {
  return plugin;
}
