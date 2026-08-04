import type { UploadProgress } from "./upload";

export type DownloadPhase = "idle" | "presigning" | "error";

/** Lifecycle hooks for presign-and-navigate download. */
export type DownloadHooks = {
  /** Runs before presigning. Return `false` to block the download. */
  beforeDownload?: (key: string) => Promise<boolean> | boolean;
  /** Fires as soon as the browser has been handed the URL — not when download completes. */
  onInitiated?: (key: string) => void;
  onError?: (key: string, error: unknown) => void;
};

export type FetchDownloadPhase =
  "idle" | "presigning" | "downloading" | "success" | "error";

/** Identical shape to {@link UploadProgress}. */
export type FetchDownloadProgress = UploadProgress;

/** Lifecycle hooks for fetch-based download with progress. */
export type FetchDownloadHooks = {
  /** Runs before presigning. Return `false` to block the download. */
  beforeDownload?: (key: string) => Promise<boolean> | boolean;
  /** Fires when the byte transfer begins. */
  onDownloadStart?: (key: string) => void;
  onProgress?: (key: string, progress: UploadProgress) => void;
  onSuccess?: (key: string, fileName: string) => Promise<void> | void;
  onError?: (key: string, error: unknown, phase: FetchDownloadPhase) => void;
  /** Fires when cancelled via `cancel()`. */
  onCancel?: (key: string) => void;
};
