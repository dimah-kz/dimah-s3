"use client";

import { useCallback } from "react";
import { validateFile } from "@dimah-s3/core";
import {
  ErrorCode,
  useDropzone,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type FileRejection,
} from "react-dropzone";
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
 * Dropzone owns picker / drag / size / count. Type matching uses
 * {@link validateFile} (same HTML `accept` tokens as programmatic upload).
 * The native input gets the HTML `accept` attribute directly.
 *
 * @internal — prefer {@link useUpload} / {@link useMultiUpload}.
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

  const validator = useCallback(
    (file: File) => {
      const error = validateFile(file, { accept: optsRef.current.accept });
      if (error?.code !== "FILE_TYPE_NOT_ALLOWED") return null;
      return { code: ErrorCode.FileInvalidType, message: error.message };
    },
    [optsRef],
  );

  const htmlAccept =
    options.accept
      ?.map((token) => token.trim())
      .filter(Boolean)
      .join(",") || undefined;

  const {
    getRootProps,
    getInputProps: getDropzoneInputProps,
    open,
    isDragActive,
    isDragAccept,
    isDragReject,
    fileRejections,
  } = useDropzone({
    maxSize: options.maxFileSize,
    maxFiles: options.maxFiles,
    multiple: options.multiple ?? false,
    disabled: options.disabled,
    noClick: options.noClick,
    noDrag: options.noDrag,
    noKeyboard: options.noKeyboard,
    validator,
    onDropAccepted,
    onDropRejected,
  });

  const getInputProps = useCallback(
    <T extends DropzoneInputProps>(props?: T): T =>
      getDropzoneInputProps({
        ...props,
        ...(htmlAccept != null ? { accept: htmlAccept } : {}),
      } as T),
    [getDropzoneInputProps, htmlAccept],
  );

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
