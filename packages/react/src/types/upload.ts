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
  /**
   * Client extras sent to the server `object` callback as `clientMetadata`.
   * Not written to S3 unless the route copies them into `object().metadata`.
   */
  metadata?: Record<string, string>;
  /** Override auto-detected content type. */
  contentType?: string;
  /**
   * Original file name sent on presign. Defaults to the browser's `file.name`.
   * The protocol requires a non-empty name — it cannot be omitted.
   */
  fileName?: string;
};

/** Lifecycle hooks for single-file upload. */
export type UploadHooks = {
  /** Runs before the upload starts. Return `false` to block it. */
  beforeUpload?: (file: File) => Promise<boolean> | boolean;
  /** Fires after validation passes and the upload begins. */
  onUploadStart?: (file: File) => void;
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

/** Engine configuration for `useFileUpload` and `useMultiFileUpload`. */
export type FileUploadConfig = {
  /**
   * Named server route (`dimahS3({ routes })`). Required — the server
   * generates the object key from this route's policy.
   */
  route: string;
  /**
   * Attempt multipart when the file is at least 50 MB. The server must
   * enable `multipart` on the route or init returns `FEATURE_DISABLED`.
   */
  multipart?: boolean;
  /**
   * HTML `accept` tokens: MIME types (`image/*`, `application/pdf`) and/or
   * extensions (`.pdf`). Client-side UX only — the server enforces
   * route `fileTypes`.
   */
  accept?: string[];
  /**
   * Max file size in bytes. Client-side UX only — the server enforces
   * route `maxFileSize`.
   */
  maxFileSize?: number;
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
export type MultiFileUploadConfig = FileUploadConfig & {
  /** Max number of files in a batch. */
  maxFiles?: number;
  /** Number of files uploaded concurrently. */
  concurrentFiles?: number;
};
