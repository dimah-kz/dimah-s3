/**
 * Type helper for a custom dimah-s3 presign API.
 *
 * Accepts an `S3Api` object — implement each method to call your own backend
 * endpoint, tRPC mutation, GraphQL query, or anything else. The object is
 * returned as-is; `defineApi` just enforces the type contract.
 *
 * If you are using the default dimah-s3 route layout, use `createS3Client`
 * from `@dimah-s3/react` (or `@dimah-s3/core` without React bindings).
 *
 * @example
 * ```ts
 * import { defineApi } from "@dimah-s3/react";
 *
 * export const api = defineApi({
 *   async upload(payload) {
 *     return fetch("/api/storage/presign", { method: "POST", body: JSON.stringify(payload) })
 *       .then(r => r.json());
 *   },
 *   async confirm(payload) { ... },
 *   async download(key, options) { ... },
 *   async delete(key) { ... },
 *   multipart: { init, signPart, listParts, complete, abort },
 * });
 * ```
 */
import type { S3Api } from "@dimah-s3/core";

export function defineApi(input: S3Api): S3Api {
  return input;
}
