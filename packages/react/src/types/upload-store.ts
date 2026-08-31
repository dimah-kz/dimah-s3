// ── StoredUpload ──────────────────────────────────────────────────────────────

/**
 * Minimal state that must be persisted to resume a multipart upload.
 */
export type StoredUpload = {
  /**
   * Client-side resume identity
   * (`${route}:${file.name}:${file.size}:${file.lastModified}`).
   */
  resumeKey: string;
  /** S3 multipart `UploadId` returned by `CreateMultipartUpload`. */
  uploadId: string;
  /** Server-generated S3 object key. */
  key: string;
  /** Total file size in bytes — used to verify the same file is being resumed. */
  fileSize: number;
};

// ── UploadStore interface ─────────────────────────────────────────────────────

/**
 * Storage backend for resumable multipart uploads.
 *
 * Implement this interface to persist `uploadId` state in any storage system
 * (database, Redis, IndexedDB, etc.). The default implementation uses
 * `localStorage` via `createLocalStorageStore()`.
 *
 * Lookup is by {@link StoredUpload.resumeKey}, not the S3 object key.
 *
 * @example
 * ```ts
 * const dbStore: UploadStore = {
 *   async get(resumeKey, fileSize) {
 *     const row = await db.uploads.findFirst({ where: { resumeKey, fileSize } });
 *     return row
 *       ? {
 *           resumeKey,
 *           uploadId: row.uploadId,
 *           key: row.key,
 *           fileSize,
 *         }
 *       : null;
 *   },
 *   async set(upload) {
 *     await db.uploads.upsert({
 *       where: { resumeKey: upload.resumeKey },
 *       data: upload,
 *     });
 *   },
 *   async delete(resumeKey) {
 *     await db.uploads.deleteMany({ where: { resumeKey } });
 *   },
 * };
 * ```
 */
export type UploadStore = {
  /**
   * Look up a pending upload by resume identity and file size.
   * Returns `null` if no matching upload is found.
   */
  get: (
    resumeKey: string,
    fileSize: number,
  ) => StoredUpload | null | Promise<StoredUpload | null>;

  /**
   * Persist a new upload state after `CreateMultipartUpload` succeeds.
   * Called once per upload, before any parts are sent.
   */
  set: (upload: StoredUpload) => void | Promise<void>;

  /**
   * Remove the upload state after the upload completes or is explicitly
   * abandoned. Should be a no-op if the key is not found.
   */
  delete: (resumeKey: string) => void | Promise<void>;
};
