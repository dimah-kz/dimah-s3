import type { S3Api } from "@dimah-s3/core";
import { S3_API_BASE_PATH } from "@dimah-s3/core";
import { createServerApi } from "./api";
import { createHandler } from "./handler";
import {
  applyPlugins,
  type DimahS3Plugin,
  type PluginContextMap,
} from "./plugin";
import type { DimahS3Config } from "./types";

export type DimahS3<
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Framework-agnostic HTTP handler (`Request` → `Response`). */
  handler: (request: Request) => Promise<Response>;
  /** Same `S3Api` as the browser client — call from Server Actions / RSC without HTTP. */
  api: S3Api;
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
 * export const { GET, POST, DELETE } = toNextJsHandler(s3);
 *
 * await s3.api.download(key, { headers: await headers() });
 * ```
 */
export function dimahS3<const P extends readonly DimahS3Plugin[] = []>(
  config: DimahS3Config & { plugins?: P },
): DimahS3<PluginContextMap<P>> {
  const {
    config: resolved,
    context,
    getPlugin,
    endpoints,
  } = applyPlugins(config);
  const basePath = resolved.basePath ?? S3_API_BASE_PATH;

  return {
    handler: createHandler(resolved, basePath, endpoints),
    api: createServerApi(resolved),
    context,
    getPlugin,
    ...context,
  } as DimahS3<PluginContextMap<P>>;
}
