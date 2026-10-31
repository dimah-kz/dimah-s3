import {
  normalizeS3ApiBasePath,
  S3_API_BASE_PATH,
  S3_ERROR_CODES,
  S3_MAX_EXPIRES_IN,
  type ConfirmedObjectResponse,
} from "@dimah-s3/core";
import { createS3Router } from "@/api/router";
import { coreEndpoints } from "@/api/routes";
import { hookList, resolveRoutes } from "@/helpers/features";
import { resolveLogger } from "@/helpers/logger";
import { parseSecretOption } from "@/helpers/ticket";
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
import type { ResolvedConfig } from "@/types/resolved";

const DEFAULT_MAX_REQUEST_BODY_SIZE = 1_048_576;

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

/**
 * Applies the documented defaults and builds the hook lists: plugin hooks
 * in plugin order, then the user hook. Throws on a config error.
 */
function resolveConfig(config: DimahS3Config): ResolvedConfig {
  const plugins = config.plugins ?? [];
  const { basePath, baseURL } = resolveApiLocation(config);
  const maxExpiresIn = Math.min(
    positiveOption("maxExpiresIn", config.maxExpiresIn) ?? S3_MAX_EXPIRES_IN,
    S3_MAX_EXPIRES_IN,
  );
  const maxRequestBodySize =
    positiveOption("maxRequestBodySize", config.maxRequestBodySize) ??
    DEFAULT_MAX_REQUEST_BODY_SIZE;

  return {
    basePath,
    ...(baseURL !== undefined ? { baseURL } : {}),
    secret: parseSecretOption(config.secret),
    ticketSubject:
      config.ticketSubject ??
      plugins.find((plugin) => plugin.hooks?.ticketSubject)?.hooks
        ?.ticketSubject,
    maxExpiresIn,
    maxRequestBodySize,
    logger: resolveLogger(config.logger),
    onError: config.onError,
    guard: hookList(plugins, (plugin) => plugin.hooks?.guard, config.guard),
    routes: resolveRoutes(config, { maxExpiresIn, plugins }),
  };
}

/**
 * `basePath` without a trailing slash, and `baseURL` without one. When only
 * `baseURL` is set, its path is the `basePath`. When both are set, they
 * must agree.
 */
function resolveApiLocation(config: DimahS3Config): {
  basePath: string;
  baseURL?: string;
} {
  const basePath =
    config.basePath === undefined
      ? undefined
      : normalizeS3ApiBasePath(config.basePath);
  if (config.baseURL === undefined) {
    return { basePath: basePath ?? S3_API_BASE_PATH };
  }

  const url = parseURL(config.baseURL);
  if (url?.protocol !== "http:" && url?.protocol !== "https:") {
    throw new Error("dimahS3: baseURL must be an absolute http(s) URL.");
  }
  if (url.search || url.hash) {
    throw new Error("dimahS3: baseURL must not have a query or a hash.");
  }
  const urlPath = normalizeS3ApiBasePath(url.pathname);
  if (basePath !== undefined && basePath !== urlPath) {
    throw new Error(
      `dimahS3: the baseURL path "${urlPath || "/"}" must equal basePath "${basePath || "/"}".`,
    );
  }
  return { basePath: urlPath, baseURL: `${url.origin}${urlPath}` };
}

function parseURL(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function positiveOption(
  field: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`dimahS3: ${field} must be a positive integer.`);
  }
  return value;
}
