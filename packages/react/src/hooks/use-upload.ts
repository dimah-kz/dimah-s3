"use client";

import type { APIError, S3Api } from "@dimah-s3/core";
import type {
  UploadFileState,
  UploadPhase,
  UploadProgress,
  FileUploadConfig,
  UploadHooks,
  UploadRequestOptions,
} from "@/types";
import { useFileUpload } from "./use-file-upload";
import {
  useFileIntake,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection,
} from "./use-file-intake";
import {
  useRouteUploadPolicy,
  type UseRouteUploadPolicyReturn,
} from "./use-route-upload-policy";
import { DEFAULT_MAX_FILES } from "@/upload/constants";

export type { DropzoneInputProps, DropzoneRootProps, FileRejection };

/** Catalog constraints plus the client `maxFiles` cap. */
export type UploadPolicy = UseRouteUploadPolicyReturn & {
  /** Max files per selection. @default 1 */
  maxFiles: number;
};

/** Options for {@link useUpload}. */
export type UseUploadOptions = FileUploadConfig &
  UploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
    /** Static request options applied to every file. */
    uploadOptions?: UploadRequestOptions;
    /** Per-file request options (overrides `uploadOptions`). */
    getUploadOptions?: (file: File) => UploadRequestOptions;
    /** Disable all intake interactions. */
    disabled?: boolean;
    /**
     * Disable drag interactions on the root (button-style custom UIs).
     * `UploadButton` does not bind `getRootProps` — it only uses `open()`.
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

export type UseUploadReturn = {
  /** Per-file states in the current batch. */
  files: UploadFileState[];
  /** First file; handy when `maxFiles` is 1. Same as `files[0] ?? null`. */
  file: UploadFileState | null;
  /** Batch phase. Single-file batches also surface `presigning` / `finalizing`. */
  phase: UploadPhase;
  /** Aggregate byte transfer progress. */
  progress: UploadProgress;
  /** Batch-level error, or `null`. */
  error: APIError | null;
  /** `true` while bytes are transferring (`phase === "uploading"`). */
  isUploading: boolean;
  /**
   * `true` while the upload is in-flight (`validating`, `presigning`,
   * `uploading`, or `finalizing`).
   */
  isPending: boolean;
  /**
   * Resolved client constraints: catalog values plus hook overrides,
   * and `maxFiles` (default 1).
   */
  policy: UploadPolicy;
  /** `true` when an `uploadStore` is configured (pause/resume). */
  resumable: boolean;
  /**
   * Start an upload from a picker, drop, paste, or a `File` you already have.
   */
  handleFiles: (files: FileList | File[] | File | null) => Promise<void>;
  /** Open the native file picker. */
  open: () => void;
  /** Abort and reset to idle. */
  cancel: () => void;
  /**
   * Soft-stop: preserves S3 parts and store entry so a future upload can
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

function toFileArray(files: FileList | File[] | File | null): File[] {
  if (files == null) return [];
  if (files instanceof File) return [files];
  return Array.from(files);
}

export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const { disabled, noDrag, noClick, noKeyboard, onFileReject, ...uploadOpts } =
    options;

  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const resumable =
    options.uploadStore != null && options.uploadStore !== false;

  const catalogPolicy = useRouteUploadPolicy({
    api: options.api,
    route: options.route,
    accept: options.accept,
    maxFileSize: options.maxFileSize,
    multipart: options.multipart,
    checksum: options.checksum,
  });

  const engine = useFileUpload(uploadOpts);

  const handleFiles = (files: FileList | File[] | File | null) => {
    const list = toFileArray(files);
    if (list.length === 0) return Promise.resolve();
    return engine.upload(list);
  };

  const intake = useFileIntake({
    accept: catalogPolicy.accept,
    maxFileSize: catalogPolicy.maxFileSize,
    maxFiles,
    multiple: maxFiles > 1,
    disabled: Boolean(disabled) || engine.isPending,
    noDrag,
    noClick,
    noKeyboard,
    onAccept: (files) => {
      void handleFiles(files);
    },
    onReject: onFileReject,
  });

  return {
    files: engine.files,
    file: engine.file,
    phase: engine.phase,
    progress: engine.progress,
    error: engine.error,
    isUploading: engine.isUploading,
    isPending: engine.isPending,
    policy: { ...catalogPolicy, maxFiles },
    resumable,
    handleFiles,
    open: intake.open,
    cancel: engine.cancel,
    detach: engine.detach,
    reset: engine.reset,
    getRootProps: intake.getRootProps,
    getInputProps: intake.getInputProps,
    isDragActive: intake.isDragActive,
    isDragAccept: intake.isDragAccept,
    isDragReject: intake.isDragReject,
    fileRejections: intake.fileRejections,
  };
}
