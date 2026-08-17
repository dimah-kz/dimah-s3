import type { Endpoint } from "better-call";
import type { DimahS3Plugin } from "./types";

/**
 * Identity helper that preserves literal `id`, context, and endpoint types
 * for {@link dimahS3} inference (`s3.context[id]` / `s3.api`).
 */
export function definePlugin<
  Id extends string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEndpoints extends Record<string, Endpoint> = Record<string, Endpoint>,
>(
  plugin: DimahS3Plugin<Id, TContext, TEndpoints>,
): DimahS3Plugin<Id, TContext, TEndpoints> {
  return plugin;
}
