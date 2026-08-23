import type { UploadPresignResponse } from "@dimah-s3/core";
import type { UploadStore } from "./upload-store";

/** Result returned after a successful upload. */
export type UploadResult = {
  /** S3 object key. */
  key: string;
  /** Object ETag from S3. */
  eTag?: string;
};

/** Byte transfer progress for upload and fetch-download. */
export type UploadProgress = {
  /** Bytes transferred so far. */
  loaded: number;
  /** Total bytes to transfer. */
  total: number;
  /** Progress percentage (0–100). */
  percent: number;
  /** Instantaneous transfer speed in bytes/second. `undefined` until measurable. */
  speed?: number;
};

export type UploadPhase =
  | "idle"
  | "validating"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "success"
  | "error";

/** Display metadata for a file in upload UI (no raw `File`). */
export type UploadFileInfo = {
  /** Display file name. */
  name: string;
  /** File size in bytes. */
  size: number;
  /** MIME type from the browser `File`. */
  type: string;
  /**
   * Object URL for an image thumbnail, or `null` for non-images.
   * Created/revoked by upload hooks — do not revoke manually while hooks own it.
   */
  previewUrl: string | null;
};

/** Per-upload options passed to the presign API. */
export type UploadRequestOptions = {
  /** Custom S3 object metadata (`x-amz-meta-*`). */
  metadata?: Record<string, string>;
  /** Target bucket (overrides server default). */
  bucket?: string;
  /** Override auto-detected content type. */
  contentType?: string;
  /** Object ACL — defaults to `'private'`. */
  acl?: "private" | "public-read";
  /**
   * Original file name stored as `Content-Disposition` on the S3 object.
   * Defaults to the browser's `file.name` when not provided.
   * Pass `null` to omit Content-Disposition entirely.
   */
  fileName?: string | null;
  /**
   * Per-upload multipart part size in bytes. Overrides `UploadConfig.partSize`.
   * Minimum 5 MB; ignored for non-multipart uploads.
   */
  partSize?: number;
};

/** Lifecycle hooks for single-file upload. */
export type UploadHooks = {
  /** Runs before the upload starts. Return `false` to block it. */
  beforeUpload?: (file: File) => Promise<boolean> | boolean;
  /** Fires after validation passes and the upload begins. */
  onUploadStart?: (file: File, key: string) => void;
  /** Fires continuously while bytes are transferred. */
  onProgress?: (file: File, progress: UploadProgress) => void;
  /** Fires after each part is successfully uploaded to S3 (multipart only). */
  onPartUpload?: (file: File, partNumber: number, totalParts: number) => void;
  /** Fires once after `CreateMultipartUpload` succeeds (multipart only). */
  onMultipartInit?: (file: File, uploadId: string) => void;
  /** Fires when the upload finishes successfully. */
  onSuccess?: (file: File, result: UploadResult) => Promise<void> | void;
  /** Fires when the upload fails with an unrecoverable error. */
  onError?: (file: File | null, error: unknown, phase: UploadPhase) => void;
  /** Fires when the upload is cancelled via `cancel()`. */
  onCancel?: (file: File | null) => void;
};

/**
 * Replaces PUT/POST to `presign.url`. Use for in-memory backends or when
 * file bytes must not pass through a serverless function.
 */
export type UploadTransport = (
  file: File,
  presign: UploadPresignResponse,
  options: {
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
  },
) => Promise<void>;

/**
 * Custom `S3Api` objects may set this to handle the byte transfer instead of
 * uploading to the presigned URL.
 */
export type S3ApiUploadTransport = {
  uploadTransport?: UploadTransport;
};

/** Retry configuration for failed network requests. */
export type RetryConfig = {
  /** Maximum number of retry attempts per request. @default 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. @default 1000 */
  baseDelay?: number;
};

/** Upload engine configuration for `useFileUpload` and `useMultiFileUpload`. */
export type UploadConfig = {
  /** Enable multipart uploads for large files. */
  multipart?: boolean;
  /**
   * HTML `accept` tokens: MIME types (`image/*`, `application/pdf`) and/or
   * extensions (`.pdf`).
   */
  accept?: string[];
  /** Max file size in bytes. */
  maxFileSize?: number;
  /** File size threshold in bytes above which multipart is used. */
  multipartThreshold?: number;
  /**
   * Multipart part size in bytes. Minimum 5 MB.
   * Can be overridden per-upload via `UploadRequestOptions.partSize`.
   * @default 5 MB
   */
  partSize?: number;
  /** Number of parts uploaded concurrently (multipart). */
  concurrentParts?: number;
  /** Retry configuration for failed network requests. */
  retry?: RetryConfig;
  /**
   * Store for resumable multipart uploads.
   *
   * - Omit / `undefined` — abort immediately on cancel or error.
   * - `false` — same as omitting.
   * - Custom `UploadStore` — persist `uploadId` across sessions.
   */
  uploadStore?: UploadStore | false;
};

/** Extra engine configuration for multi-file uploads. */
export type MultiUploadConfig = UploadConfig & {
  /** Max number of files in a batch. */
  maxFiles?: number;
  /** Number of files uploaded concurrently. */
  concurrentFiles?: number;
};
