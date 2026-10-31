import type { DimahS3Plugin } from "./types";

/**
 * Identity helper that keeps the literal `id` and the `context` type, so
 * `s3.context[id]` and `s3[id]` are typed.
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
>(plugin: DimahS3Plugin<Id, TContext>): DimahS3Plugin<Id, TContext> {
  return plugin;
}
