import { errors } from "./errors";
import { applyPlugins, type DimahS3Plugin, type PluginContextMap, type PluginEndpointMap } from "./plugin";
import { coreEndpoints, type CoreEndpoints } from "./api/routes";
import { createS3Router } from "./router";
import type { DimahS3Config } from "./types";

export type DimahS3<
  P extends readonly DimahS3Plugin[] = [],
  C extends Record<string, unknown> = PluginContextMap<P>,
> = {
  /** Framework-agnostic HTTP handler (`Request` → `Response`). */
  handler: (request: Request) => Promise<Response>;
  /**
   * better-call endpoints — invoke as functions from Server Actions / RSC.
   *
   * ```ts
   * await s3.api.download({ query: { key }, headers: await headers() });
   * ```
   */
  api: CoreEndpoints & PluginEndpointMap<P>;
  /** Plugin contexts keyed by plugin id. */
  context: C;
  /** Lookup a registered plugin by id. */
  getPlugin: (id: string) => DimahS3Plugin | undefined;
} & C;

/**
 * Create a dimah-s3 server instance.
 *
 * Plugin contexts are available on `s3.context[id]` and flattened onto the
 * instance itself (`s3.db` when the `db` plugin is registered, etc.).
 *
 * @example
 * ```ts
 * export const s3 = dimahS3({
 *   s3: s3Client,
 *   defaultBucket: "my-bucket",
 *   upload: { enabled: true },
 * });
 *
 * export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(s3);
 *
 * await s3.api.download({ query: { key }, headers: await headers() });
 * ```
 */
export function dimahS3<const P extends readonly DimahS3Plugin[] = []>(
  config: DimahS3Config & { plugins?: P },
): DimahS3<P> {
  const {
    config: resolved,
    context,
    getPlugin,
    endpoints: pluginEndpoints,
  } = applyPlugins(config);

  const endpoints = { ...coreEndpoints, ...pluginEndpoints };
  const router = createS3Router(endpoints, {
    config: resolved,
    errors,
  });

  return {
    handler: router.handler,
    api: router.endpoints as DimahS3<P>["api"],
    context,
    getPlugin,
    ...context,
  } as DimahS3<P>;
}
