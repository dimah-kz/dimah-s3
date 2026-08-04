import type { UploadProgress, UploadResult } from "./upload";

export type MultiUploadPhase =
  "idle" | "validating" | "uploading" | "success" | "error";

/** Per-file state in a multi-upload batch. */
export type MultiUploadFileState = {
  /** Unique ID for this file in the batch. */
  id: string;
  /** Display file name. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  status: "pending" | "uploading" | "success" | "error";
  progress: UploadProgress;
  error: string | null;
};

/** Lifecycle hooks for multi-file upload. */
export type MultiUploadHooks = {
  beforeUpload?: (files: File[]) => Promise<boolean> | boolean;
  onUploadStart?: (files: File[]) => void;
  onFileProgress?: (file: File, progress: UploadProgress) => void;
  onFileSuccess?: (file: File, result: UploadResult) => void;
  onFileError?: (file: File, error: string) => void;
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (results: UploadResult[]) => Promise<void> | void;
  onError?: (error: unknown) => void;
  onCancel?: () => void;
};
