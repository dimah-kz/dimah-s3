import type { DimahS3Error } from "@dimah-s3/core";
import type { UploadFileInfo, UploadProgress, UploadResult } from "./upload";

export type MultiUploadPhase =
  "idle" | "validating" | "uploading" | "success" | "error";

/** Per-file state in a multi-upload batch. */
export type MultiUploadFileState = UploadFileInfo & {
  /** Unique ID for this file in the batch. */
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: UploadProgress;
  error: DimahS3Error | null;
};

/** Lifecycle hooks for multi-file upload. */
export type MultiUploadHooks = {
  beforeUpload?: (files: File[]) => Promise<boolean> | boolean;
  onUploadStart?: (files: File[]) => void;
  onFileProgress?: (file: File, progress: UploadProgress) => void;
  onFileSuccess?: (file: File, result: UploadResult) => void;
  onFileError?: (file: File, error: DimahS3Error) => void;
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (results: UploadResult[]) => Promise<void> | void;
  onError?: (error: unknown) => void;
  onCancel?: () => void;
};
