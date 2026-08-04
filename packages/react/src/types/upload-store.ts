// ── StoredUpload ──────────────────────────────────────────────────────────────

/**
 * Minimal state that must be persisted to resume a multipart upload.
 */
export type StoredUpload = {
  /** S3 multipart `UploadId` returned by `CreateMultipartUpload`. */
  uploadId: string;
  /** S3 object key. */
  key: string;
  /** Total file size in bytes — used to verify the same file is being resumed. */
  fileSize: number;
  /** Bucket override, if any. */
  bucket?: string;
};

// ── UploadStore interface ─────────────────────────────────────────────────────

/**
 * Storage backend for resumable multipart uploads.
 *
 * Implement this interface to persist `uploadId` state in any storage system
 * (database, Redis, IndexedDB, etc.). The default implementation uses
 * `localStorage` via `createLocalStorageStore()`.
 *
 * @example
 * ```ts
 * // Custom database-backed store
 * const dbStore: UploadStore = {
 *   async get(key, fileSize) {
 *     const row = await db.uploads.findFirst({ where: { key, fileSize } });
 *     return row ? { uploadId: row.uploadId, key, fileSize, bucket: row.bucket } : null;
 *   },
 *   async set(upload) {
 *     await db.uploads.upsert({ where: { key: upload.key }, data: upload });
 *   },
 *   async delete(key) {
 *     await db.uploads.deleteMany({ where: { key } });
 *   },
 * };
 * ```
 */
export type UploadStore = {
  /**
   * Look up a pending upload by its S3 object key and file size.
   * Returns `null` if no matching upload is found.
   */
  get: (
    key: string,
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
  delete: (key: string) => void | Promise<void>;
};
