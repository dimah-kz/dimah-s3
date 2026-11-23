import type {
  APIError,
  ConfirmedObjectResponse,
  S3Api,
  S3RouteName,
  UploadPresignResponse,
} from "@dimah-s3/core";
import type { TransferProgress } from "./operation";
import type { UploadStore } from "./upload-store";

/** The verified object after a successful upload (from HeadObject). */
export type UploadResult = ConfirmedObjectResponse;

/** Per-upload options sent to the presign API. */
export type UploadRequestOptions = {
  /**
   * Client extras the server hooks receive as `clientMetadata`.
   * Not written to S3 unless the route copies them into `object().metadata`.
   */
  clientMetadata?: Record<string, string>;
  /** Overrides the browser's content type. */
  contentType?: string;
  /** Overrides the browser's file name. */
  fileName?: string;
};

/**
 * Request options for every file, or a function that returns them per file.
 * The function runs as the file starts, and may resolve later, such as once
 * a folder for it exists: the file is `preparing` meanwhile. A throw or
 * rejection fails that file: an `APIError` as it is, anything else with
 * `HOOK_FAILED`.
 */
export type UploadRequestInput =
  | UploadRequestOptions
  | ((file: File) => UploadRequestOptions | Promise<UploadRequestOptions>);

/**
 * Options for one `handleFiles` call. Call `uploadOptions` shallow-merge over
 * the hook's: call fields win, and `clientMetadata` merges key by key.
 */
export type UploadCallOptions = {
  uploadOptions?: UploadRequestInput;
  /** Lowers `maxFiles` for this call. */
  maxFiles?: number;
  /**
   * Overrides the hook's `append` for this call: `true` adds its files to
   * the queue and leaves the files in flight alone, `false` replaces the
   * queue.
   */
  append?: boolean;
};

/**
 * Where one file is in its upload. `paused` files wait in the queue for
 * `resume`; they take no upload slot.
 */
export type UploadFilePhase =
  | "queued"
  | "preparing"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "paused"
  | "success"
  | "error";

/** The phases `uploadFile` reports while a file is in flight. */
export type UploadEnginePhase = Extract<
  UploadFilePhase,
  "preparing" | "presigning" | "uploading" | "finalizing"
>;

/**
 * The phase of the whole upload queue: `uploading` while a call prepares or
 * a file is in flight, else `paused` while a file is paused, else how the
 * settled files ended.
 */
export type UploadPhase = "idle" | "uploading" | "paused" | "success" | "error";

/** Display metadata for a file in upload UI. */
export type UploadFileInfo = {
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** MIME type from the browser `File`. */
  contentType: string;
  /**
   * Object URL for an image thumbnail, or `null` for other files. The upload
   * hooks create and revoke it, so do not revoke it yourself.
   */
  previewUrl: string | null;
};

/** One file in the `useUpload` queue. */
export type UploadFileState = UploadFileInfo & {
  /** Unique ID for this file in the queue. Pass it to `cancel(id)`. */
  id: string;
  file: File;
  phase: UploadFilePhase;
  progress: TransferProgress;
  error: APIError | null;
  /** Set after this file succeeds. */
  result: UploadResult | null;
};

/** How every file of one `handleFiles` call ended. */
export type UploadBatchResult = {
  uploaded: { file: File; result: UploadResult }[];
  failed: { file: File; error: APIError }[];
  /** Files refused before upload for their type, size or count. */
  rejected: FileRejection[];
  /** Files a `beforeUpload` callback blocked. */
  blocked: File[];
  /** Files cancelled or detached before they finished. */
  aborted: File[];
};

/** A file rejected before upload, such as for its type, size or count. */
export type FileRejection = { file: File; errors: readonly APIError[] };

/**
 * A cap on the files one `useUpload` takes in across its calls, such as the
 * `maxFiles` of a form field that keeps its own value.
 */
export type UploadLimit = {
  /**
   * Files the hook may still take in. Files queued or in flight, uploaded
   * files not in `counted`, and calls still preparing take from it.
   */
  available: number;
  /**
   * Ids of uploaded files that take nothing from `available`, such as the
   * ones whose keys a field already holds.
   */
  counted?: ReadonlySet<string>;
};

/** Retry settings for failed network requests. */
export type RetryConfig = {
  /** Retries per request after the first attempt. @default 3 */
  maxRetries?: number;
  /** First backoff delay in ms. Each retry doubles it. @default 1000 */
  baseDelayMs?: number;
};

/** Options for `useUpload`. */
export type UseUploadOptions = {
  /** Optional when an `<S3Provider>` is in the tree. */
  api?: S3Api;
  /** Named server route. The server builds the object key from its policy. */
  route: S3RouteName;
  /**
   * HTML `accept` tokens: MIME types (`image/*`) and extensions (`.pdf`).
   * Narrows the route's `fileTypes`; the server still enforces the route.
   */
  accept?: readonly string[];
  /** Max file size in bytes. The smaller of this and the route's wins. */
  maxFileSize?: number;
  /** Max files per selection. @default 1 */
  maxFiles?: number;
  /** `false` disables multipart even when the route allows it. */
  multipart?: boolean;
  /** Files uploaded at once. @default 2 */
  concurrentFiles?: number;
  /** Multipart parts uploaded at once per file. @default 4 */
  concurrentParts?: number;
  retry?: RetryConfig;
  /** Persists multipart uploads so they can resume after a reload. */
  uploadStore?: UploadStore;
  /** Request options for every file. A call's `uploadOptions` merge over them. */
  uploadOptions?: UploadRequestInput;
  /**
   * `true` adds new files to the queue instead of replacing it. Without it,
   * a new call cancels the calls still preparing, and replaces the queue once
   * its files start uploading. A call that is blocked, rejected or fails
   * before uploading leaves the queue alone.
   * @default false
   */
  append?: boolean;
  /**
   * Disables every intake interaction: the root, drop targets and paste, and
   * `open()` does nothing. `handleFiles` still uploads what it is given.
   */
  disabled?: boolean;
  /** Disables drag and drop on the root and on drop targets. */
  noDrag?: boolean;
  /** Disables click-to-open on the root. */
  noClick?: boolean;
  /** Disables keyboard activation on the root. */
  noKeyboard?: boolean;
  /** Runs once per call. Return `false` to block it. */
  beforeUpload?: (files: readonly File[]) => boolean | Promise<boolean>;
  /** Runs once per call, after `beforeUpload` allows it. */
  onUploadStart?: (files: readonly File[]) => void;
  /** Byte progress of one file. */
  onProgress?: (progress: TransferProgress, file: File) => void;
  /** Runs after each multipart part is uploaded. */
  onPartUpload?: (
    part: { partNumber: number; partCount: number },
    file: File,
  ) => void;
  /** Runs once a multipart upload has started or resumed. */
  onMultipartInit?: (
    session: { uploadId: string; key: string },
    file: File,
  ) => void;
  /**
   * Runs once per uploaded file, after every file of the call has ended and
   * every `onError` of the call has run.
   */
  onSuccess?: (result: UploadResult, file: File) => void | Promise<void>;
  /** Runs once per failed file, after every file of the call has ended. */
  onError?: (error: APIError, file: File) => void | Promise<void>;
  /**
   * Runs once per call, after every other callback, including a call with
   * no valid file.
   */
  onSettled?: (result: UploadBatchResult) => void | Promise<void>;
  /** Runs with the files rejected before upload. */
  onFileReject?: (rejections: readonly FileRejection[]) => void;
};

/**
 * Replaces the PUT or POST to `presign.url` for single-shot uploads, such as
 * for an in-memory backend. It must send `presign.fields` or
 * `presign.headers` exactly, and reject with an `APIError` so the engine can
 * retry: `UPLOAD_FAILED` with S3's status, `CHECKSUM_MISMATCH` when S3
 * rejects the bytes' checksum (never retried), or `NETWORK_ERROR`.
 */
export type UploadTransport = (
  file: File,
  presign: UploadPresignResponse,
  options: {
    onProgress?: (progress: TransferProgress) => void;
    signal?: AbortSignal;
  },
) => Promise<void>;

/** An `S3Api` may set this to replace the default byte transfer. */
export type S3ApiUploadTransport = { uploadTransport?: UploadTransport };

/** Options for `uploadFile`. */
export type UploadFileOptions = {
  route: S3RouteName;
  /**
   * What the route allows. Multipart is used for files of at least
   * `DEFAULT_MULTIPART_THRESHOLD` bytes when `multipart` is true. A single-shot
   * upload sends a SHA-256 checksum when `checksum` is true; multipart
   * follows the init response instead.
   */
  policy: { multipart: boolean; checksum: boolean };
  /** Parts uploaded at once. @default 4 */
  concurrentParts?: number;
  retry?: RetryConfig;
  /** Persists multipart uploads so they can resume. */
  uploadStore?: UploadStore;
  request?: UploadRequestOptions;
  /**
   * Aborts the upload. Abort with `uploadAbortReason("detach")` to keep a
   * stored multipart upload for resuming; any other reason cancels it.
   */
  signal?: AbortSignal;
  onProgress?: (progress: TransferProgress) => void;
  onPhaseChange?: (phase: UploadEnginePhase) => void;
  onPartUpload?: (part: { partNumber: number; partCount: number }) => void;
  onMultipartInit?: (session: { uploadId: string; key: string }) => void;
};

/**
 * Why an upload was aborted. `cancel` aborts the multipart upload and deletes
 * its stored record. `detach` keeps both so the upload can resume.
 */
export type UploadAbortKind = "cancel" | "detach";
