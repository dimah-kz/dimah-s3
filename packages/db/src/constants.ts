/*
 * Values the server plugin and the browser client share. This module imports
 * nothing, so `@dimah-s3/db/client` stays free of Zod and FumaDB.
 */

/** Most rows one page of `GET /db/objects` returns. */
export const DB_LIST_MAX_LIMIT = 100;

/**
 * The `clientMetadata` key an upload names its folder with: the id of a
 * folder that already exists. `""`, or no value, is the root.
 *
 * ```ts
 * useUpload({
 *   route: "docs",
 *   uploadOptions: { clientMetadata: { [DB_FOLDER_ID_KEY]: folderId } },
 * });
 * ```
 */
export const DB_FOLDER_ID_KEY = "folderId";
