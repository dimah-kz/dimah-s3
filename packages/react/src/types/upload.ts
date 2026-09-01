import type {
  DimahS3Error,
  S3RouteName,
  UploadPresignResponse,
} from "@dimah-s3/core";
import type { UploadStore } from "./upload-store";

/** Result returned after a successful upload. */
export type UploadResult = {
  /** S3 object key. */
  key: string;
  /** Object ETag from S3. */
  eTag?: string;
  /** Verified size from HeadObject / multipart complete. */
  contentLength: number;
  /** MIME type from HeadObject. */
  contentType?: string;
  /** Stored filename. */
  fileName?: string;
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

/** Per-file status inside a batch (`pending` before bytes start). */
export type UploadFileStatus = "pending" | "uploading" | "success" | "error";

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

/** Per-file state in `useUpload` (`files[]`; `file` is `files[0]`). */
export type UploadFileState = UploadFileInfo & {
  /** Unique ID for this file in the batch. */
  id: string;
  status: UploadFileStatus;
  progress: UploadProgress;
  error: DimahS3Error | null;
  /** Set after this file succeeds. */
  result: UploadResult | null;
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
  /**
   * Unpadded base64 SHA-256. Sent when the route sets `upload.checksum`.
   * The engine computes this when {@link FileUploadConfig.checksum} is true.
   */
  checksum?: string;
};

/**
 * Lifecycle hooks for `useUpload`.
 * Callbacks that receive `File[]` / `UploadResult[]` always use arrays
 * (a single file is `[file]` / `[result]`).
 */
export type UploadHooks = {
  /** Runs before the upload starts. Return `false` to block it. */
  beforeUpload?: (files: File[]) => Promise<boolean> | boolean;
  /** Fires after validation passes and the upload begins. */
  onUploadStart?: (files: File[]) => void;
  /** Fires continuously with aggregate progress across the batch. */
  onProgress?: (progress: UploadProgress) => void;
  /** Fires continuously for one file while its bytes are transferred. */
  onFileProgress?: (file: File, progress: UploadProgress) => void;
  /** Fires after each part is successfully uploaded to S3 (multipart only). */
  onPartUpload?: (file: File, partNumber: number, totalParts: number) => void;
  /** Fires once after `CreateMultipartUpload` succeeds (multipart only). */
  onMultipartInit?: (file: File, uploadId: string) => void;
  /** Fires when one file in the batch finishes successfully. */
  onFileSuccess?: (file: File, result: UploadResult) => void;
  /** Fires when one file in the batch fails. */
  onFileError?: (file: File, error: DimahS3Error) => void;
  /** Fires when every file in the batch succeeds. */
  onSuccess?: (results: UploadResult[]) => Promise<void> | void;
  /** Fires when the batch fails (validation, block, or one or more file errors). */
  onError?: (error: unknown, phase: UploadPhase) => void;
  /** Fires when the upload is cancelled via `cancel()`. */
  onCancel?: () => void;
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

/** Engine configuration for `useUpload`. */
export type FileUploadConfig = {
  /**
   * Named server route (`dimahS3({ routes })`). Required — the server
   * generates the object key from this route's policy.
   */
  route: S3RouteName;
  /**
   * Attempt multipart when the file is at least 50 MB. The server must
   * enable `multipart` on the route or init returns `FEATURE_DISABLED`.
   * The threshold is not configurable.
   */
  multipart?: boolean;
  /**
   * HTML `accept` tokens: MIME types (`image/*`, `application/pdf`) and/or
   * extensions (`.pdf`). Client-side UX only — the server enforces
   * route `fileTypes`. Omitted values are filled from `api.catalog()`.
   */
  accept?: string[];
  /**
   * Max file size in bytes. Client-side UX only — the server enforces
   * route `maxFileSize`. Omitted values are filled from `api.catalog()`.
   */
  maxFileSize?: number;
  /**
   * Max number of files per selection. @default 1
   */
  maxFiles?: number;
  /**
   * Compute and send a SHA-256 checksum on presign. Filled from
   * `api.catalog()` when the route sets `upload.checksum`.
   */
  checksum?: boolean;
  /** Number of parts uploaded concurrently (multipart). */
  concurrentParts?: number;
  /** Number of files uploaded concurrently when `maxFiles` is greater than 1. */
  concurrentFiles?: number;
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
