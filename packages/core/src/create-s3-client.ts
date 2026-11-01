import type {
  DeleteManyResponse,
  DeleteResponse,
  MultipartAbortResponse,
  MultipartCompleteResponse,
  MultipartInitResponse,
  MultipartListPartsResponse,
  MultipartPartResponse,
  DownloadPresignResponse,
  S3Api,
  S3RequestOptions,
  UploadConfirmResponse,
  UploadPresignResponse,
  RouteCatalogResponse,
} from "./types";
import { fitFileName } from "./helpers/fit-file-name";
import { stripTrailingSlashes } from "./helpers/strip-slashes";
import { S3_ERROR_CODES } from "./error";
import { ROUTE_NAME_PATTERN } from "./limits";
import {
  createS3Fetch,
  RESERVED_CLIENT_KEYS,
  type ClientPluginMethodsMap,
  type S3ClientFetchOptions,
  type S3ClientPlugin,
  type S3Fetch,
} from "./plugin";
import {
  normalizeS3ApiBasePath,
  S3_API_BASE_PATH,
  S3_API_ROUTES,
} from "./routes";

/** Options for {@link createS3Client}. */
export type CreateS3ClientOptions<
  P extends readonly S3ClientPlugin[] = readonly S3ClientPlugin[],
> = {
  /** API path prefix — must match server `basePath`. @default "/api/s3" */
  basePath?: string;
  /**
   * Absolute client origin + path (e.g. `https://api.example.com/api/s3`).
   * Wins over {@link basePath} when both are set.
   */
  baseURL?: string;
  /** Client plugins (e.g. `dbClient()` from `@dimah-s3/db/client`). */
  plugins?: P;
} & S3ClientFetchOptions;

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;

/** better-fetch options for one call: the abort signal and per-call headers. */
function callOptions(options: S3RequestOptions | undefined) {
  return {
    signal: options?.signal,
    headers: options?.headers ? new Headers(options.headers) : undefined,
  };
}

/**
 * Resolve a root-relative URL (the `/file` proxy URL) against the origin of
 * an absolute `base`. Other URLs, and any URL under a relative `base`, are
 * returned as is.
 */
function resolveProxyUrl(url: string, base: string): string {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (!ABSOLUTE_URL.test(base)) return url;
  return new URL(url, base).href;
}

function createCoreApi($fetch: S3Fetch, base: string): S3Api {
  return {
    upload(payload, options) {
      return $fetch<UploadPresignResponse>(S3_API_ROUTES.upload, {
        method: "POST",
        body: payload,
        ...callOptions(options),
      });
    },

    confirm(payload, options) {
      return $fetch<UploadConfirmResponse>(S3_API_ROUTES.confirm, {
        method: "POST",
        body: payload,
        ...callOptions(options),
      });
    },

    async download(payload, options) {
      const { route, key, name, disposition, expiresIn } = payload;
      const response = await $fetch<DownloadPresignResponse>(
        S3_API_ROUTES.download,
        {
          method: "GET",
          query: {
            route,
            key,
            // The same rule as an upload name, so any name downloads.
            name: name ? fitFileName(name) : undefined,
            disposition,
            expiresIn,
          },
          ...callOptions(options),
        },
      );
      return { ...response, url: resolveProxyUrl(response.url, base) };
    },

    catalog(options) {
      return $fetch<RouteCatalogResponse>(S3_API_ROUTES.catalog, {
        method: "GET",
        ...callOptions(options),
      });
    },

    delete(payload, options) {
      const { route, key } = payload;
      return $fetch<DeleteResponse>(S3_API_ROUTES.delete, {
        method: "DELETE",
        query: { route, key },
        ...callOptions(options),
      });
    },

    deleteMany(payload, options) {
      return $fetch<DeleteManyResponse>(S3_API_ROUTES.deleteMany, {
        method: "POST",
        body: payload,
        ...callOptions(options),
      });
    },

    multipart: {
      init(payload, options) {
        return $fetch<MultipartInitResponse>(S3_API_ROUTES.multipartInit, {
          method: "POST",
          body: payload,
          ...callOptions(options),
        });
      },

      signPart(payload, options) {
        return $fetch<MultipartPartResponse>(S3_API_ROUTES.multipartSignPart, {
          method: "POST",
          body: payload,
          ...callOptions(options),
        });
      },

      listParts(payload, options) {
        return $fetch<MultipartListPartsResponse>(
          S3_API_ROUTES.multipartListParts,
          { method: "POST", body: payload, ...callOptions(options) },
        );
      },

      complete(payload, options) {
        return $fetch<MultipartCompleteResponse>(
          S3_API_ROUTES.multipartComplete,
          { method: "POST", body: payload, ...callOptions(options) },
        );
      },

      abort(payload, options) {
        return $fetch<MultipartAbortResponse>(S3_API_ROUTES.multipartAbort, {
          method: "POST",
          body: payload,
          ...callOptions(options),
        });
      },
    },
  };
}

/** Browser client returned by {@link createS3Client}. */
export type CreateS3ClientResult<P extends readonly S3ClientPlugin[] = []> =
  S3Api &
    ClientPluginMethodsMap<P> & {
      $ERROR_CODES: typeof S3_ERROR_CODES;
      $fetch: S3Fetch;
      $Infer: { plugins: P };
    };

/**
 * Browser (or isomorphic) client for the dimah-s3 HTTP API.
 *
 * Every method takes per-call `{ signal, headers }` last. Per-call headers
 * override the client `headers`. Failures throw `APIError`.
 *
 * For React apps prefer `createS3Client` from `@dimah-s3/react` — same options,
 * plus a bound `Provider` / typed `useApi` on the client object.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/core";
 * import { dbClient } from "@dimah-s3/db/client";
 *
 * export const api = createS3Client({
 *   basePath: "/api/s3",
 *   plugins: [dbClient()],
 * });
 *
 * await api.db.listObjects();
 * ```
 */
export function createS3Client<const P extends readonly S3ClientPlugin[] = []>(
  options?: CreateS3ClientOptions<P>,
): CreateS3ClientResult<P> {
  const { basePath, baseURL, plugins, ...fetchOptions } = options ?? {};
  // An absolute baseURL keeps its origin; only its trailing slashes go.
  const base =
    baseURL !== undefined
      ? stripTrailingSlashes(baseURL)
      : normalizeS3ApiBasePath(basePath ?? S3_API_BASE_PATH);
  const $fetch = createS3Fetch(base, fetchOptions);

  const api = createCoreApi($fetch, base);

  const pluginMethods: Record<string, unknown> = {};
  for (const plugin of plugins ?? []) {
    // The id is a path segment of the plugin's endpoints: check it now.
    if (!ROUTE_NAME_PATTERN.test(plugin.id)) {
      throw new Error(`Client plugin id "${plugin.id}" is invalid.`);
    }
    if ((RESERVED_CLIENT_KEYS as readonly string[]).includes(plugin.id)) {
      throw new Error(
        `Client plugin id "${plugin.id}" is reserved on the S3 client.`,
      );
    }
    if (Object.hasOwn(pluginMethods, plugin.id)) {
      throw new Error(`Duplicate client plugin id "${plugin.id}".`);
    }
    pluginMethods[plugin.id] = plugin.getActions($fetch);
  }

  return {
    ...api,
    ...pluginMethods,
    $ERROR_CODES: S3_ERROR_CODES,
    $fetch,
    $Infer: {} as CreateS3ClientResult<P>["$Infer"],
  } as CreateS3ClientResult<P>;
}
