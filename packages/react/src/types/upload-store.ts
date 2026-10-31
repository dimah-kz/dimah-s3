/**
 * What must be persisted to resume a multipart upload. The engine writes one
 * record after `multipart.init` and deletes it once the upload completes or
 * is cancelled.
 */
export type StoredUpload = {
  /**
   * Client-side resume identity from `multipartResumeKey`: the route, the
   * file, and the request's name, type and metadata.
   */
  resumeKey: string;
  /** Upload ticket from `multipart.init`. Every later multipart call sends it. */
  ticket: string;
  /** Server-generated S3 object key. */
  key: string;
  /** S3 multipart `UploadId`. */
  uploadId: string;
  /** Total file size in bytes, so a different file is never resumed. */
  fileSize: number;
  /** Part size the server chose, in bytes. */
  partSize: number;
  /** Number of parts the server chose. */
  partCount: number;
  /** Whether every part must send a SHA-256 checksum. */
  checksum: boolean;
};

/**
 * Storage backend for resumable multipart uploads, looked up by
 * {@link StoredUpload.resumeKey}. `createLocalStorageStore()` and
 * `createMemoryStore()` are built in. Implement it to keep uploads in any
 * other storage, such as IndexedDB or a database.
 *
 * The engine ignores and deletes a record that is not a valid
 * {@link StoredUpload}, such as one written by 1.x.
 *
 * @example
 * ```ts
 * const dbStore: UploadStore = {
 *   async get(resumeKey, fileSize) {
 *     return (await db.uploads.findFirst({ where: { resumeKey, fileSize } })) ?? null;
 *   },
 *   async set(upload) {
 *     await db.uploads.upsert({ where: { resumeKey: upload.resumeKey }, data: upload });
 *   },
 *   async delete(resumeKey) {
 *     await db.uploads.deleteMany({ where: { resumeKey } });
 *   },
 * };
 * ```
 */
export type UploadStore = {
  /** The pending upload for this resume identity and file size, or `null`. */
  get(
    resumeKey: string,
    fileSize: number,
  ): StoredUpload | null | Promise<StoredUpload | null>;
  /** Saves an upload after `multipart.init`, before any part is sent. */
  set(upload: StoredUpload): void | Promise<void>;
  /** Removes an upload. Does nothing when the key is unknown. */
  delete(resumeKey: string): void | Promise<void>;
};
