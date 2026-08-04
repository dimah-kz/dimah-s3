"use client";

import { useRef, useState } from "react";
import type {
  UploadPhase,
  UploadProgress,
  UploadRequestOptions,
} from "../types";
import { useUpload, type UseUploadOptions } from "./use-upload";

/** Options for {@link useUploadControls}. */
export type UseUploadControlsOptions = UseUploadOptions & {
  /** S3 object key, or a function that derives it from the file. */
  objectKey: string | ((file: File) => string);
  /** Static request options applied to the upload. */
  uploadOptions?: UploadRequestOptions;
  /** Per-upload request options override. */
  getUploadOptions?: (file: File) => UploadRequestOptions;
};

export type UseUploadControlsReturn = {
  /** Current upload phase. */
  phase: UploadPhase;
  /** Info about the selected file. */
  fileInfo: { name: string; size: number } | null;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Error message, or `null`. */
  error: string | null;
  /** `true` while uploading. */
  isUploading: boolean;
  /** Handle files from drag-and-drop or a file input. */
  handleFiles: (files: FileList | null) => void;
  /** Open the hidden file picker. */
  openFilePicker: () => void;
  /** Abort and reset to idle. */
  cancel: () => void;
  /**
   * Soft-stop: preserves S3 parts and store entry so a future `upload()` can
   * resume. For non-resumable uploads, identical to `cancel()`.
   * See `UseUploadReturn.detach` for full semantics.
   */
  detach: () => void;
  reset: () => void;
  /** Spread on a hidden `<input>` element. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: "file";
    accept?: string;
    hidden: true;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  /** Spread on a container to enable drag-and-drop. */
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
};

export function useUploadControls(
  options: UseUploadControlsOptions,
): UseUploadControlsReturn {
  const single = useUpload(options);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const resolveKey = (file: File): string =>
    typeof options.objectKey === "function"
      ? options.objectKey(file)
      : options.objectKey;

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size });
    await single.upload(file, resolveKey(file), {
      ...options.uploadOptions,
      ...options.getUploadOptions?.(file),
    });
  };

  return {
    phase: single.phase,
    fileInfo,
    progress: single.progress,
    error: single.error,
    isUploading: single.phase === "uploading",
    handleFiles,
    openFilePicker: () => inputRef.current?.click(),
    cancel: single.cancel,
    detach: single.detach,
    reset: () => {
      single.reset();
      setFileInfo(null);
    },
    inputProps: {
      ref: inputRef,
      type: "file",
      accept: options.accept?.join(","),
      hidden: true,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
        e.target.value = "";
      },
    },
    dropHandlers: {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (single.phase !== "uploading") handleFiles(e.dataTransfer.files);
      },
    },
  };
}
