import type {
  DeleteResponse,
  MultipartAbortResponse,
  MultipartCompleteResponse,
  MultipartInitResponse,
  MultipartListPartsResponse,
  MultipartPartResponse,
  PresignResponse,
  S3Api,
  UploadConfirmResponse,
  UploadPresignResponse,
} from "./types";
import { sanitizeFileName } from "./helpers/sanitize-file-name";
import { S3_ERROR_CODES } from "./error";
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

/** Strip server-only `headers` before sending over HTTP. */
function withoutHeaders<T extends { headers?: HeadersInit }>(
  value: T,
): Omit<T, "headers"> {
  const { headers: _headers, ...rest } = value;
  return rest;
}

function createCoreApi($fetch: S3Fetch): S3Api {
  return {
    upload(payload) {
      return $fetch<UploadPresignResponse>(S3_API_ROUTES.upload, {
        method: "POST",
        body: withoutHeaders(payload),
      });
    },

    confirm(payload) {
      return $fetch<UploadConfirmResponse>(S3_API_ROUTES.uploadConfirm, {
        method: "POST",
        body: withoutHeaders(payload),
      });
    },

    download(key, options?) {
      const { fileName, bucket, expiresIn } = options ?? {};
      return $fetch<PresignResponse>(S3_API_ROUTES.download, {
        method: "GET",
        query: {
          key,
          fileName: fileName ? sanitizeFileName(fileName) : undefined,
          bucket,
          expiresIn,
        },
      });
    },

    delete(key, options?) {
      const { bucket } = options ?? {};
      return $fetch<DeleteResponse>(S3_API_ROUTES.delete, {
        method: "DELETE",
        query: { key, bucket },
      });
    },

    multipart: {
      init(payload) {
        return $fetch<MultipartInitResponse>(S3_API_ROUTES.multipartInit, {
          method: "POST",
          body: withoutHeaders(payload),
        });
      },

      signPart(payload) {
        return $fetch<MultipartPartResponse>(S3_API_ROUTES.multipartPart, {
          method: "POST",
          body: withoutHeaders(payload),
        });
      },

      listParts(payload) {
        const { key, uploadId, bucket } = withoutHeaders(payload);
        return $fetch<MultipartListPartsResponse>(
          S3_API_ROUTES.multipartListParts,
          { method: "GET", query: { key, uploadId, bucket } },
        );
      },

      complete(payload) {
        return $fetch<MultipartCompleteResponse>(
          S3_API_ROUTES.multipartComplete,
          {
            method: "POST",
            body: withoutHeaders(payload),
          },
        );
      },

      abort(payload) {
        return $fetch<MultipartAbortResponse>(S3_API_ROUTES.multipartAbort, {
          method: "POST",
          body: withoutHeaders(payload),
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
  const base = normalizeS3ApiBasePath(
    baseURL ?? basePath ?? S3_API_BASE_PATH,
  );
  const $fetch = createS3Fetch(base, fetchOptions);

  const api = createCoreApi($fetch);

  const pluginMethods: Record<string, unknown> = {};
  for (const plugin of plugins ?? []) {
    if ((RESERVED_CLIENT_KEYS as readonly string[]).includes(plugin.id)) {
      throw new Error(
        `Client plugin id "${plugin.id}" is reserved on the S3 client.`,
      );
    }
    if (plugin.id in pluginMethods) {
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
