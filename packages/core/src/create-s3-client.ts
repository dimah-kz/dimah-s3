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
import {
  createFetcher,
  RESERVED_CLIENT_KEYS,
  type ClientPluginMethodsMap,
  type S3ClientFetchOptions,
  type S3ClientPlugin,
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

/**
 * Browser (or isomorphic) client for the dimah-s3 HTTP API.
 *
 * For React apps prefer `createS3Client` from `@dimah-s3/react` — same options,
 * plus a bound `S3Provider` / typed `useApi`.
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
): S3Api & ClientPluginMethodsMap<P> {
  const { basePath, plugins, ...fetchOptions } = options ?? {};
  const base = normalizeS3ApiBasePath(basePath ?? S3_API_BASE_PATH);
  const fetcher = createFetcher(base, fetchOptions);

  const api: S3Api = {
    upload(payload) {
      return fetcher.post<UploadPresignResponse>(
        S3_API_ROUTES.upload,
        withoutHeaders(payload),
      );
    },

    confirm(payload) {
      return fetcher.post<UploadConfirmResponse>(
        S3_API_ROUTES.uploadConfirm,
        withoutHeaders(payload),
      );
    },

    download(key, options?) {
      const { fileName, bucket } = options ?? {};
      return fetcher.get<PresignResponse>(S3_API_ROUTES.download, {
        key,
        fileName: fileName ? sanitizeFileName(fileName) : undefined,
        bucket,
      });
    },

    delete(key, options?) {
      const { bucket } = options ?? {};
      return fetcher.delete<DeleteResponse>(S3_API_ROUTES.delete, {
        key,
        bucket,
      });
    },

    multipart: {
      init(payload) {
        return fetcher.post<MultipartInitResponse>(
          S3_API_ROUTES.multipartInit,
          withoutHeaders(payload),
        );
      },

      signPart(payload) {
        return fetcher.post<MultipartPartResponse>(
          S3_API_ROUTES.multipartPart,
          withoutHeaders(payload),
        );
      },

      listParts(payload) {
        const { key, uploadId, bucket } = withoutHeaders(payload);
        return fetcher.get<MultipartListPartsResponse>(
          S3_API_ROUTES.multipartListParts,
          { key, uploadId, bucket },
        );
      },

      complete(payload) {
        return fetcher.post<MultipartCompleteResponse>(
          S3_API_ROUTES.multipartComplete,
          withoutHeaders(payload),
        );
      },

      abort(payload) {
        return fetcher.post<MultipartAbortResponse>(
          S3_API_ROUTES.multipartAbort,
          withoutHeaders(payload),
        );
      },
    },
  };

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
    pluginMethods[plugin.id] = plugin.createMethods(fetcher);
  }

  return { ...api, ...pluginMethods } as S3Api & ClientPluginMethodsMap<P>;
}
