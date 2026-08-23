import { S3_ERROR_CODES } from "@dimah-s3/core";
import {
  applyPlugins,
  type DimahS3Plugin,
  type PluginContextMap,
  type PluginEndpointMap,
} from "./plugin";
import { coreEndpoints, type CoreEndpoints } from "./api/routes";
import { createS3Router } from "./api/router";
import type { DimahS3Config } from "./types";

export type MultipartAliasApi = {
  init: CoreEndpoints["multipartInit"];
  signPart: CoreEndpoints["multipartPart"];
  listParts: CoreEndpoints["multipartListParts"];
  complete: CoreEndpoints["multipartComplete"];
  abort: CoreEndpoints["multipartAbort"];
};

export type DimahS3Api<P extends readonly DimahS3Plugin[] = []> =
  CoreEndpoints & {
    multipart: MultipartAliasApi;
  } & PluginEndpointMap<P>;

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
   * await s3.api.multipart.init({ body: { key } });
   * ```
   */
  api: DimahS3Api<P>;
  /** Plugin contexts keyed by plugin id. */
  context: C;
  /** Lookup a registered plugin by id. */
  getPlugin: {
    <Id extends P[number]["id"]>(
      id: Id,
    ): Extract<P[number], { id: Id }> | undefined;
    (id: string): DimahS3Plugin | undefined;
  };
  $ERROR_CODES: typeof S3_ERROR_CODES;
  $Infer: {
    api: DimahS3Api<P>;
    context: C;
  };
} & C;

/**
 * Create a dimah-s3 server instance.
 *
 * Plugin contexts are available on `s3.context[id]` and flattened onto the
 * instance itself (`s3.db` when the `db` plugin is registered, etc.).
 *
 * @example
 * ```ts
 * export const awsS3 = new S3Client({ ... });
 * export const s3 = dimahS3({
 *   client: awsS3,
 *   bucket: "my-bucket",
 *   upload: true,
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
  const router = createS3Router(endpoints, { config: resolved });
  const bound = router.endpoints as CoreEndpoints & PluginEndpointMap<P>;

  const api = {
    ...bound,
    multipart: {
      init: bound.multipartInit,
      signPart: bound.multipartPart,
      listParts: bound.multipartListParts,
      complete: bound.multipartComplete,
      abort: bound.multipartAbort,
    },
  } as DimahS3<P>["api"];

  return {
    handler: router.handler,
    api,
    context,
    getPlugin,
    $ERROR_CODES: S3_ERROR_CODES,
    $Infer: {} as DimahS3<P>["$Infer"],
    ...context,
  } as DimahS3<P>;
}
