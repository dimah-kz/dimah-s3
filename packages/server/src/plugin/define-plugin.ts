import type { DimahS3Plugin } from "./types";

/**
 * Identity helper that preserves literal `id` and context types for
 * {@link dimahS3} inference (`s3.context[id]` / flattened `s3[id]`).
 *
 * ```ts
 * export function db(options: DbPluginOptions) {
 *   return definePlugin({
 *     id: "db",
 *     hooks: { ... },
 *     context: { objects, client },
 *   });
 * }
 * ```
 */
export function definePlugin<
  Id extends string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(plugin: DimahS3Plugin<Id, TContext>): DimahS3Plugin<Id, TContext> {
  return plugin;
}
