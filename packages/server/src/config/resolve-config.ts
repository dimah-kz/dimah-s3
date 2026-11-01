import {
  normalizeS3ApiBasePath,
  S3_API_BASE_PATH,
  S3_MAX_EXPIRES_IN,
} from "@dimah-s3/core";
import { resolveLogger } from "@/helpers/logger";
import { parseSecretOption } from "@/helpers/ticket";
import type { DimahS3Config } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import {
  hookList,
  optionalPositiveInteger,
  resolveRoutes,
} from "./resolve-routes";

/** Largest JSON request body when `maxRequestBodySize` is not set (1 MiB). */
const DEFAULT_MAX_REQUEST_BODY_SIZE = 1_048_576;

/**
 * Checks the `dimahS3()` config, applies the documented defaults, and builds
 * the hook lists: plugin hooks in plugin order, then the user hook. Throws
 * on a config error, so `dimahS3()` fails at startup.
 */
export function resolveConfig(config: DimahS3Config): ResolvedConfig {
  const plugins = config.plugins ?? [];
  const { basePath, baseURL } = resolveApiLocation(config);
  const maxExpiresIn = Math.min(
    optionalPositiveInteger(config.maxExpiresIn, "dimahS3: maxExpiresIn") ??
      S3_MAX_EXPIRES_IN,
    S3_MAX_EXPIRES_IN,
  );
  const logger = resolveLogger(config.logger);
  const maxRequestBodySize =
    optionalPositiveInteger(
      config.maxRequestBodySize,
      "dimahS3: maxRequestBodySize",
    ) ?? DEFAULT_MAX_REQUEST_BODY_SIZE;

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
    logger,
    onError: config.onError,
    guard: hookList(plugins, (plugin) => plugin.hooks?.guard, config.guard),
    routes: resolveRoutes(config, { maxExpiresIn, plugins, logger }),
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
