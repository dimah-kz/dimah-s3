"use client";

import type { DimahS3Error } from "@dimah-s3/core";
import type {
  UploadFileInfo,
  UploadPhase,
  UploadProgress,
  UploadResult,
} from "@/types";
import { useFileUpload, type UseFileUploadOptions } from "./use-file-upload";
import {
  useFileIntake,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection,
} from "./use-file-intake";
import { useRouteUploadPolicy } from "./use-route-upload-policy";

export type { DropzoneInputProps, DropzoneRootProps, FileRejection };

/** Options for {@link useUpload}. */
export type UseUploadOptions = UseFileUploadOptions & {
  /** Disable all intake interactions. */
  disabled?: boolean;
  /**
   * Disable drag interactions on the root (button-style UIs).
   * @default false
   */
  noDrag?: boolean;
  /**
   * Disable click-to-open on the root (when opening via `open()` on a button).
   * @default false
   */
  noClick?: boolean;
  /**
   * Disable keyboard activation on the root.
   * @default false
   */
  noKeyboard?: boolean;
  /** Called when dropzone soft-rejects files (type/size). */
  onFileReject?: (rejections: readonly FileRejection[]) => void;
};

export type UseUploadReturn = {
  /** Current upload phase. */
  phase: UploadPhase;
  /** Info about the selected file. */
  fileInfo: UploadFileInfo | null;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Last error, or `null`. */
  error: DimahS3Error | null;
  /** Result after success, or `null`. */
  result: UploadResult | null;
  /** `true` while bytes are transferring (`phase === "uploading"`). */
  isUploading: boolean;
  /**
   * `true` while the upload is in-flight (`validating`, `presigning`,
   * `uploading`, or `finalizing`).
   */
  isPending: boolean;
  /** Handle files programmatically (bypasses dropzone). */
  handleFiles: (files: FileList | File[] | null) => void;
  /** Open the native file picker. */
  open: () => void;
  /** Abort and reset to idle. */
  cancel: () => void;
  /**
   * Soft-stop: preserves S3 parts and store entry so a future `upload()` can
   * resume. For non-resumable uploads, identical to `cancel()`.
   */
  detach: () => void;
  reset: () => void;
  /** Spread on the dropzone / clickable root element. */
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  /** Spread on a hidden `<input type="file">`. */
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  /** `true` while a drag is over the root. */
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  /** Soft rejections from the last drop / selection. */
  fileRejections: readonly FileRejection[];
};

export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const { disabled, noDrag, noClick, noKeyboard, onFileReject, ...uploadOpts } =
    options;

  const policy = useRouteUploadPolicy({
    api: options.api,
    route: options.route,
    accept: options.accept,
    maxFileSize: options.maxFileSize,
    multipart: options.multipart,
    checksum: options.checksum,
  });

  const single = useFileUpload(uploadOpts);

  const handleFiles = (files: FileList | File[] | null) => {
    const list = files == null ? [] : Array.from(files);
    const file = list[0];
    if (!file) return;
    void single.upload(file);
  };

  const intake = useFileIntake({
    accept: policy.accept,
    maxFileSize: policy.maxFileSize,
    maxFiles: 1,
    multiple: false,
    disabled: Boolean(disabled) || single.isPending,
    noDrag,
    noClick,
    noKeyboard,
    onAccept: (files) => handleFiles(files),
    onReject: onFileReject,
  });

  return {
    phase: single.phase,
    fileInfo: single.fileInfo,
    progress: single.progress,
    error: single.error,
    result: single.result,
    isUploading: single.isUploading,
    isPending: single.isPending,
    handleFiles,
    open: intake.open,
    cancel: single.cancel,
    detach: single.detach,
    reset: single.reset,
    getRootProps: intake.getRootProps,
    getInputProps: intake.getInputProps,
    isDragActive: intake.isDragActive,
    isDragAccept: intake.isDragAccept,
    isDragReject: intake.isDragReject,
    fileRejections: intake.fileRejections,
  };
}
