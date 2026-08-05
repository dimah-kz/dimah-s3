// ─── Types ───────────────────────────────────────────────────────────────────
export * from "./types";

// ─── S3 API factory + React context provider ──────────────────────────────────
export { defineApi } from "./api";
export { createS3Client, type CreateS3ClientOptions } from "./create-s3-client";
export {
  S3Provider,
  useApi,
  S3Context,
  type S3ProviderProps,
} from "./s3-provider";

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
  createSpeedTracker,
  type SpeedTracker,
} from "./helpers";

// ─── Hooks ────────────────────────────────────────────────────────────────────
export {
  useUpload,
  type UseUploadOptions,
  type UseUploadState,
  type UseUploadReturn,
} from "./hooks/use-upload";
export {
  useMultiUpload,
  type UseMultiUploadOptions,
  type UseMultiUploadState,
  type UseMultiUploadReturn,
} from "./hooks/use-multi-upload";
export {
  useUploadControls,
  type UseUploadControlsOptions,
  type UseUploadControlsReturn,
} from "./hooks/use-upload-controls";
export {
  useMultiUploadControls,
  type UseMultiUploadControlsOptions,
  type UseMultiUploadControlsReturn,
} from "./hooks/use-multi-upload-controls";
export {
  useDownload,
  type DownloadPhase,
  type DownloadHooks,
  type UseDownloadOptions,
  type UseDownloadState,
  type UseDownloadReturn,
} from "./hooks/use-download";
export {
  useFetchDownload,
  type FetchDownloadPhase,
  type FetchDownloadProgress,
  type FetchDownloadHooks,
  type UseFetchDownloadOptions,
  type UseFetchDownloadState,
  type UseFetchDownloadReturn,
} from "./hooks/use-fetch-download";
export {
  useDelete,
  type UseDeleteOptions,
  type UseDeleteState,
  type UseDeleteReturn,
} from "./hooks/use-delete";
