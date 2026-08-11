"use client";

import type {
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "../types";
import { useMultiUpload, type UseMultiUploadOptions } from "./use-multi-upload";
import {
  useFileIntake,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection,
} from "./use-file-intake";

/** Options for {@link useMultiUploadControls}. */
export type UseMultiUploadControlsOptions = UseMultiUploadOptions & {
  /** S3 object key, or a function that derives it from each file. */
  objectKey: string | ((file: File) => string);
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
  /** Called when dropzone soft-rejects files (type/size/count). */
  onFileReject?: (rejections: readonly FileRejection[]) => void;
};

export type UseMultiUploadControlsReturn = {
  /** Current batch upload phase. */
  phase: MultiUploadPhase;
  /** Per-file upload states. */
  files: MultiUploadFileState[];
  /** Aggregated progress across all files. */
  totalProgress: UploadProgress;
  /** Batch-level error message, or `null`. */
  error: string | null;
  /** `true` while uploading. */
  isUploading: boolean;
  /** Handle files programmatically (bypasses dropzone). */
  handleFiles: (files: FileList | File[] | null) => void;
  /** Open the native file picker. */
  open: () => void;
  /** Abort all in-flight uploads. */
  cancel: () => void;
  /** Preserve multipart store entries for resume. */
  detach: () => void;
  /** Reset state to `idle`. */
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

export function useMultiUploadControls(
  options: UseMultiUploadControlsOptions,
): UseMultiUploadControlsReturn {
  const {
    objectKey,
    disabled,
    noDrag,
    noClick,
    noKeyboard,
    onFileReject,
    ...multiOpts
  } = options;

  const multi = useMultiUpload(multiOpts);

  const resolveKey = (file: File): string =>
    typeof objectKey === "function" ? objectKey(file) : objectKey;

  const handleFiles = (files: FileList | File[] | null) => {
    if (files == null) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    void multi.upload(list, resolveKey);
  };

  const isUploading = multi.phase === "uploading";

  const intake = useFileIntake({
    accept: options.accept,
    maxFileSize: options.maxFileSize,
    maxFiles: options.maxFiles,
    multiple: true,
    disabled: Boolean(disabled) || isUploading,
    noDrag,
    noClick,
    noKeyboard,
    onAccept: (files) => handleFiles(files),
    onReject: onFileReject,
  });

  return {
    phase: multi.phase,
    files: multi.files,
    totalProgress: multi.totalProgress,
    error: multi.error,
    isUploading,
    handleFiles,
    open: intake.open,
    cancel: multi.cancel,
    detach: multi.detach,
    reset: multi.reset,
    getRootProps: intake.getRootProps,
    getInputProps: intake.getInputProps,
    isDragActive: intake.isDragActive,
    isDragAccept: intake.isDragAccept,
    isDragReject: intake.isDragReject,
    fileRejections: intake.fileRejections,
  };
}
