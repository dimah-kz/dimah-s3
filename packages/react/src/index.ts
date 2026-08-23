// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  UploadResult,
  UploadProgress,
  UploadPhase,
  UploadFileInfo,
  UploadRequestOptions,
  UploadHooks,
  UploadTransport,
  S3ApiUploadTransport,
  RetryConfig,
  UploadConfig,
  MultiUploadConfig,
} from "./types/upload";
export type { StoredUpload, UploadStore } from "./types/upload-store";
export type {
  MultiUploadPhase,
  MultiUploadFileState,
  MultiUploadHooks,
} from "./types/multi-upload";
export type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadProgress,
  FetchDownloadHooks,
} from "./types/download";
export type { DeletePhase, DeleteHooks } from "./types/delete";

// ─── Protocol helpers (so React apps rarely need @dimah-s3/core) ─────────────
export {
  DimahS3Error,
  S3_ERROR_CODES,
  buildObjectKey,
  defaultObjectKey,
  formatFileSize,
  isAPIError,
  isDimahS3Error,
  isS3ErrorCode,
  sanitizeFileName,
  validateFile,
  type S3Api,
  type S3ErrorCode,
  type ValidateFileError,
} from "@dimah-s3/core";

// ─── S3 API factory + React context provider ──────────────────────────────────
export { defineApi } from "./api";
export {
  createS3Client,
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
  type ReactS3Client,
} from "./create-s3-client";
export { S3Provider, useApi, type S3ProviderProps } from "./s3-provider";

// ─── Translations (Fuma) ──────────────────────────────────────────────────────
/** Generated key map — use with `satisfies Partial<Translations>`. */
export type { Translations } from "./translations";

// ─── Upload store implementations ────────────────────────────────────────────
export { createLocalStorageStore, createMemoryStore } from "./store";

// ─── Low-level upload engine (advanced use) ───────────────────────────────────
export {
  uploadFile,
  uploadFiles,
  type UploadEngineCallbacks,
  type FileItem,
  type FileItemStatus,
  type MultiUploadCallbacks,
} from "./upload";

// ─── Helpers ──────────────────────────────────────────────────────────────────
export {
  formatAcceptLabels,
  formatUploadProgress,
  formatSpeed,
  formatEta,
  useFormatDimahError,
  useFormatValidateFileError,
} from "./helpers";

// ─── Hooks ────────────────────────────────────────────────────────────────────
export {
  useFileUpload,
  type UseFileUploadOptions,
  type UseFileUploadState,
  type UseFileUploadReturn,
} from "./hooks/use-file-upload";
export {
  useMultiFileUpload,
  type UseMultiFileUploadOptions,
  type UseMultiFileUploadState,
  type UseMultiFileUploadReturn,
} from "./hooks/use-multi-file-upload";
export {
  useUpload,
  type UseUploadOptions,
  type UseUploadReturn,
  type FileRejection,
  type DropzoneRootProps,
  type DropzoneInputProps,
} from "./hooks/use-upload";
export {
  useMultiUpload,
  type UseMultiUploadOptions,
  type UseMultiUploadReturn,
} from "./hooks/use-multi-upload";
export {
  useDownload,
  type UseDownloadOptions,
  type UseDownloadReturn,
  type UseNavigateDownloadOptions,
  type UseNavigateDownloadReturn,
  type UseFetchDownloadOptions,
  type UseFetchDownloadState,
  type UseFetchDownloadReturn,
} from "./hooks/use-download";
export {
  useDelete,
  type UseDeleteOptions,
  type UseDeleteState,
  type UseDeleteReturn,
} from "./hooks/use-delete";
