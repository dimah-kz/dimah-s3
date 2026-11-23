import type { S3Api } from "@dimah-s3/core";
import type { S3ApiUploadTransport } from "./types/upload";

/**
 * Type helper for a custom dimah-s3 API.
 *
 * Implement each `S3Api` method to call your own backend endpoint, tRPC
 * mutation, GraphQL query, or anything else. Each method takes
 * `(payload, options)`; forward `options.signal` so cancels reach the
 * request. Add `uploadTransport` to replace the byte transfer. The object is
 * returned as-is; `defineApi` only checks the type.
 *
 * With the default dimah-s3 route layout, use `createS3Client` from
 * `@dimah-s3/react` (or `@dimah-s3/core` without React bindings) instead.
 *
 * @example
 * ```ts
 * import { defineApi } from "@dimah-s3/react/engine";
 *
 * export const api = defineApi({
 *   async upload(payload, options) {
 *     const res = await fetch("/api/storage/presign", {
 *       method: "POST",
 *       body: JSON.stringify(payload),
 *       signal: options?.signal,
 *     });
 *     return res.json();
 *   },
 *   async confirm(payload, options) { ... },
 *   async download(payload, options) { ... },
 *   async catalog(options) { ... },
 *   async delete(payload, options) { ... },
 *   async deleteMany(payload, options) { ... },
 *   multipart: { init, signPart, listParts, complete, abort },
 * });
 * ```
 */
export function defineApi<TApi extends S3Api & S3ApiUploadTransport>(
  api: TApi,
): TApi {
  return api;
}
