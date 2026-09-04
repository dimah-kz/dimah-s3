// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  UploadResult,
  UploadProgress,
  UploadPhase,
  UploadFileInfo,
  UploadFileState,
  UploadRequestOptions,
  UploadHooks,
  UploadTransport,
  S3ApiUploadTransport,
  RetryConfig,
  FileUploadConfig,
} from "./types/upload";
export type { StoredUpload, UploadStore } from "./types/upload-store";
export type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadProgress,
  FetchDownloadHooks,
} from "./types/download";
export type { DeletePhase, DeleteHooks } from "./types/delete";
export { S3UploadError } from "./types/error";

// ─── Protocol helpers (so React apps rarely need @dimah-s3/core) ─────────────
export {
  APIError,
  S3_ERROR_CODES,
  buildObjectKey,
  fileNameFromKey,
  formatFileSize,
  isAPIError,
  isS3ErrorCode,
  sanitizeFileName,
  validateFile,
  sha256Base64,
  sha256File,
  matchesMagicBytes,
  sniffContentType,
  buildPublicObjectUrl,
  buildContentDisposition,
  type S3Api,
  type S3ErrorCode,
  type ValidateFileError,
  type InferS3Routes,
  type DimahS3Routes,
  type S3RouteName,
  type RouteCatalogResponse,
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
  multipartResumeKey,
  DEFAULT_MULTIPART_THRESHOLD,
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
  loadRouteCatalog,
  mergeRouteUploadPolicy,
  resolveRouteUploadPolicy,
} from "./helpers";
export type { RouteUploadPolicy } from "./helpers";

// ─── Hooks ────────────────────────────────────────────────────────────────────
export {
  useUpload,
  type UseUploadOptions,
  type UseUploadReturn,
  type UploadPolicy,
  type FileRejection,
  type DropzoneRootProps,
  type DropzoneInputProps,
} from "./hooks/use-upload";
export {
  useDownload,
  isFetchDownload,
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
export {
  useRouteUploadPolicy,
  type CatalogLoadStatus,
  type UseRouteUploadPolicyOptions,
  type UseRouteUploadPolicyReturn,
} from "./hooks/use-route-upload-policy";
export {
  useObjectUrl,
  type UseObjectUrlOptions,
  type UseObjectUrlReturn,
} from "./hooks/use-object-url";
