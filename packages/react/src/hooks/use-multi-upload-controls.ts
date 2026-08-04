"use client";

import { useRef } from "react";
import type {
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "../types";
import { useMultiUpload, type UseMultiUploadOptions } from "./use-multi-upload";

/** Options for {@link useMultiUploadControls}. */
export type UseMultiUploadControlsOptions = UseMultiUploadOptions & {
  /** S3 object key, or a function that derives it from each file. */
  objectKey: string | ((file: File) => string);
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
  /** Handle files from drag-and-drop or a file input. */
  handleFiles: (files: FileList | null) => void;
  /** Open the hidden file picker. */
  openFilePicker: () => void;
  /** Abort all in-flight uploads. */
  cancel: () => void;
  /** Preserve multipart store entries for resume. */
  detach: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
  /** Spread on a hidden `<input>` element. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: "file";
    multiple: true;
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

export function useMultiUploadControls(
  options: UseMultiUploadControlsOptions,
): UseMultiUploadControlsReturn {
  const multi = useMultiUpload(options);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolveKey = (file: File): string =>
    typeof options.objectKey === "function"
      ? options.objectKey(file)
      : options.objectKey;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await multi.upload(Array.from(files), resolveKey);
  };

  return {
    phase: multi.phase,
    files: multi.files,
    totalProgress: multi.totalProgress,
    error: multi.error,
    isUploading: multi.phase === "uploading",
    handleFiles,
    openFilePicker: () => inputRef.current?.click(),
    cancel: multi.cancel,
    detach: multi.detach,
    reset: multi.reset,
    inputProps: {
      ref: inputRef,
      type: "file",
      multiple: true,
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
        if (multi.phase !== "uploading") handleFiles(e.dataTransfer.files);
      },
    },
  };
}
