import { S3_ERROR_CODES, type ConfirmedObjectResponse } from "@dimah-s3/core";
import { createS3Router } from "@/api/router";
import { coreEndpoints } from "@/api/core-endpoints";
import { resolveConfig } from "@/config/resolve-config";
import { putObject } from "@/operations/put";
import { createS3Api } from "@/operations/s3-api";
import {
  applyPlugins,
  type DimahS3Plugin,
  type PluginContextMap,
} from "@/plugin";
import type {
  DimahS3Api,
  DimahS3Config,
  DimahS3RouteConfig,
  PutInput,
  S3ServerCallOptions,
} from "@/types/config";

/** A dimah-s3 server instance, returned by {@link dimahS3}. */
export type DimahS3<
  P extends readonly DimahS3Plugin[] = [],
  C = PluginContextMap<P>,
  R extends Record<string, DimahS3RouteConfig> = Record<
    string,
    DimahS3RouteConfig
  >,
> = {
  /** Framework-agnostic HTTP handler (`Request` → `Response`). */
  handler: (request: Request) => Promise<Response>;
  /**
   * The browser client's API, run in process. Pass `request` or `headers`
   * for the hooks, and trusted `locals` to seed the guards.
   *
   * ```ts
   * await s3.api.download({ route: "invoices", key }, { headers: await headers() });
   * ```
   */
  api: DimahS3Api;
  /** Uploads from the server through the route's upload policy. */
  put: (
    input: PutInput,
    options?: S3ServerCallOptions,
  ) => Promise<ConfirmedObjectResponse>;
  /** Plugin contexts keyed by plugin id. */
  context: C;
  /** Looks up a registered plugin by id. */
  getPlugin: {
    <Id extends P[number]["id"]>(
      id: Id,
    ): Extract<P[number], { id: Id }> | undefined;
    (id: string): DimahS3Plugin | undefined;
  };
  $ERROR_CODES: typeof S3_ERROR_CODES;
  /** Type-only helpers: `typeof s3.$Infer.routes`. */
  $Infer: {
    api: DimahS3Api;
    context: C;
    routes: keyof R & string;
  };
} & C;

/**
 * Creates a dimah-s3 server instance.
 *
 * The config is checked here, so a mistake throws at startup. The ticket
 * secret is the exception: without a `secret` option, `DIMAH_S3_SECRET` is
 * read on the first upload.
 *
 * Plugin contexts are on `s3.context[id]` and on the instance itself
 * (`s3.db` when the `db` plugin is registered).
 *
 * @example
 * ```ts
 * export const s3 = dimahS3({
 *   client: awsS3,
 *   bucket: "my-bucket",
 *   routes: {
 *     uploads: route({ upload: { fileTypes: ["image/*"] } }),
 *     invoices: route({ download: true }),
 *   },
 * });
 *
 * export const { GET, POST, PATCH, DELETE } = toNextJsHandler(s3);
 *
 * await s3.api.download({ route: "invoices", key }, { headers: await headers() });
 * ```
 */
export function dimahS3<
  const P extends readonly DimahS3Plugin[] = [],
  const R extends Record<string, DimahS3RouteConfig> = Record<
    string,
    DimahS3RouteConfig
  >,
>(
  config: DimahS3Config & { plugins?: P; routes: R },
): DimahS3<P, PluginContextMap<P>, R> {
  const resolved = resolveConfig(config);
  const { context, getPlugin, endpoints } = applyPlugins(
    config,
    resolved.logger,
  );
  const router = createS3Router(
    { ...coreEndpoints, ...endpoints },
    { config, resolved },
  );

  return {
    handler: router.handler,
    api: createS3Api(resolved),
    put: (input, options) => putObject(resolved, input, options),
    context,
    getPlugin,
    $ERROR_CODES: S3_ERROR_CODES,
    $Infer: {} as DimahS3<P, PluginContextMap<P>, R>["$Infer"],
    ...context,
  } as DimahS3<P, PluginContextMap<P>, R>;
}
