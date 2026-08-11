"use client";

import { useCallback } from "react";
import {
  useDropzone,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection,
} from "react-dropzone";
import { toDropzoneAccept } from "../helpers/to-dropzone-accept";
import { useLiveRef } from "../internal-helpers";

/** Options for {@link useFileIntake}. */
export type UseFileIntakeOptions = {
  /** MIME types / extensions (dimah-s3 `accept` shape). */
  accept?: string[];
  /** Max file size in bytes (soft check at intake). */
  maxFileSize?: number;
  /** Max number of files (multi mode). */
  maxFiles?: number;
  /** Allow multiple files. @default false */
  multiple?: boolean;
  /** Disable all intake interactions. */
  disabled?: boolean;
  /** Disable click-to-open on the root. Useful for button-driven UIs. */
  noClick?: boolean;
  /** Disable drag-and-drop. */
  noDrag?: boolean;
  /** Disable keyboard activation on the root. */
  noKeyboard?: boolean;
  /** Called with accepted files from drop / picker / paste. */
  onAccept: (files: File[]) => void;
  /** Called when dropzone soft-rejects files. */
  onReject?: (rejections: readonly FileRejection[]) => void;
};

export type UseFileIntakeReturn = {
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  /** Open the native file picker. */
  open: () => void;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  /** Soft rejections from the last drop / selection. */
  fileRejections: readonly FileRejection[];
};

/**
 * Headless file intake powered by react-dropzone.
 *
 * Soft-validates `accept` / size / count at the dropzone layer; authoritative
 * validation still runs inside `useUpload` / `useMultiUpload` via `validateFile`.
 *
 * @internal — prefer {@link useUploadControls} / {@link useMultiUploadControls}.
 */
export function useFileIntake(
  options: UseFileIntakeOptions,
): UseFileIntakeReturn {
  const optsRef = useLiveRef(options);

  const onDropAccepted = useCallback(
    (files: File[]) => {
      optsRef.current.onAccept(files);
    },
    [optsRef],
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      optsRef.current.onReject?.(rejections);
    },
    [optsRef],
  );

  const {
    getRootProps,
    getInputProps,
    open,
    isDragActive,
    isDragAccept,
    isDragReject,
    fileRejections,
  } = useDropzone({
    accept: toDropzoneAccept(options.accept),
    maxSize: options.maxFileSize,
    maxFiles: options.maxFiles,
    multiple: options.multiple ?? false,
    disabled: options.disabled,
    noClick: options.noClick,
    noDrag: options.noDrag,
    noKeyboard: options.noKeyboard,
    onDropAccepted,
    onDropRejected,
  });

  return {
    getRootProps,
    getInputProps,
    open,
    isDragActive,
    isDragAccept,
    isDragReject,
    fileRejections,
  };
}

export type { FileRejection, DropzoneRootProps, DropzoneInputProps };
