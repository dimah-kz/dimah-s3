"use client";

import { useCallback, useContext, useId } from "react";
import type { APIError } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { useLiveRef } from "@/internal/hooks";
import { requireApi } from "@/internal/client-error";
import type { TransferProgress } from "@/types/operation";
import type {
  FileRejection,
  UploadBatchResult,
  UploadCallOptions,
  UploadFileState,
  UploadPhase,
  UseUploadOptions,
} from "@/types/upload";
import { DEFAULT_MAX_FILES } from "@/upload/constants";
import { useFileUpload } from "./use-file-upload";
import {
  useFileIntake,
  type DropTargetProps,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type UploadCallInput,
} from "./use-file-intake";
import {
  useRouteUploadPolicyState,
  type UseRouteUploadPolicyReturn,
} from "./use-route-upload-policy";

export type { DropTargetProps, DropzoneInputProps, DropzoneRootProps };
export type { FileRejection, UseUploadOptions } from "@/types/upload";

/**
 * The route's upload policy narrowed by the hook options: the stricter
 * `accept` and `maxFileSize` win, `multipart` needs the route and an option
 * that is not `false`, and `checksum` follows the route.
 */
export type UploadPolicy = UseRouteUploadPolicyReturn & {
  /** Max files per call. @default 1 */
  maxFiles: number;
};

/** What {@link useUpload} returns. */
export type UseUploadReturn = {
  /** Stable for the life of the component. Toast owners use it. */
  instanceId: string;
  /** Every file in the queue, in the order it was added. */
  files: readonly UploadFileState[];
  /** The first file, or `null`. Handy when `maxFiles` is 1. */
  file: UploadFileState | null;
  /** `uploading` while a call is preparing or a file is in flight. */
  phase: UploadPhase;
  /** Bytes sent across every file in the queue. */
  progress: TransferProgress;
  /** The one failed file's error, or `PARTIAL_FAILURE` when several failed. */
  error: APIError | null;
  /** `true` while `phase` is `uploading`. */
  isPending: boolean;
  policy: UploadPolicy;
  /** `true` when an `uploadStore` is set, so multipart uploads can resume. */
  resumable: boolean;
  /**
   * The `disabled` option: the root, drop targets, paste and `open()` do
   * nothing. Render pickers and paste handlers disabled while it is set;
   * `handleFiles` still uploads what it is given.
   */
  disabled: boolean;
  /**
   * Validates and uploads files from a picker, a drop, a paste or your own
   * code. Invalid files are rejected without stopping the others. Resolves
   * once every file has ended.
   */
  handleFiles: (
    files: FileList | readonly File[] | File | null,
    call?: UploadCallOptions,
  ) => Promise<UploadBatchResult>;
  /** Opens the native file picker. `call` applies to the picked files. */
  open: (call?: UploadCallOptions) => void;
  /**
   * Uploads the failed file `id` again, or every failed file. Each file goes
   * with the options of the call it came from: it is validated again, and
   * `beforeUpload` and `onUploadStart` run again. It keeps its place and
   * `id` in the queue, and a retry never replaces the queue. Resolves like
   * `handleFiles`; with nothing to retry, at once and without callbacks.
   */
  retry: (id?: string) => Promise<UploadBatchResult>;
  /** Cancels one file by `id`, or every file. */
  cancel: (id?: string) => void;
  /** Stops every file but keeps stored multipart uploads for resuming. */
  detach: () => void;
  /** Removes settled files and rejections. Stable identity. */
  reset: () => void;
  /**
   * Spread on a dropzone: drag and drop, paste, click and keyboard to open
   * the picker. `call` applies to the files it takes in.
   */
  getRootProps: <T extends DropzoneRootProps>(
    props?: T,
    call?: UploadCallInput,
  ) => T;
  /**
   * Drag and drop handlers only: no `tabIndex`, no click or keyboard, no
   * `role`. For drop targets that keep their own interactions, such as
   * folder rows. A drop on a target inside a dropzone uses the target's
   * `call`.
   */
  getDropTargetProps: <T extends object = DropTargetProps>(
    props?: T & DropTargetProps,
    call?: UploadCallInput,
  ) => T & DropTargetProps;
  /** Spread on a hidden `<input type="file">`. */
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  /** `true` while files are dragged over a dropzone or drop target. */
  isDragActive: boolean;
  /** `true` while the dragged files match `accept` and `maxFiles`. */
  isDragAccept: boolean;
  /** `true` while the dragged files break `accept` or `maxFiles`. */
  isDragReject: boolean;
  /** Files the newest call rejected for their type, size or count. */
  fileRejections: readonly FileRejection[];
};

/**
 * Uploads files to a named route through a queue.
 *
 * Every call validates its files against the route policy from the catalog
 * and rejects the invalid ones with catalog error codes, so
 * `useFormatError` can show them. Valid files upload `concurrentFiles`
 * at a time, and each one can be cancelled with `cancel(id)`. A call's
 * `uploadOptions` merge over the hook's: call fields win, and `metadata`
 * merges key by key.
 */
export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const instanceId = useId();
  const contextApi = useContext(S3Context);
  const api = requireApi(options.api ?? contextApi, "useUpload");
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;

  const [routePolicy, reloadCatalog] = useRouteUploadPolicyState({
    api,
    route: options.route,
    accept: options.accept,
    maxFileSize: options.maxFileSize,
    multipart: options.multipart,
  });
  const engine = useFileUpload(options);
  const { upload, retry: retryFiles } = engine;
  const catalogStatusRef = useLiveRef(routePolicy.status);

  // A call loads the catalog again, so the policy can recover too.
  const handleFiles = useCallback(
    (
      files: FileList | readonly File[] | File | null,
      call?: UploadCallOptions,
    ) => {
      if (catalogStatusRef.current === "error") reloadCatalog();
      return upload(toFileArray(files), call);
    },
    [catalogStatusRef, reloadCatalog, upload],
  );
  const retry = useCallback(
    (id?: string) => {
      if (catalogStatusRef.current === "error") reloadCatalog();
      return retryFiles(id);
    },
    [catalogStatusRef, reloadCatalog, retryFiles],
  );

  const intake = useFileIntake({
    accept: routePolicy.accept,
    maxFiles,
    disabled: options.disabled,
    noDrag: options.noDrag,
    noClick: options.noClick,
    noKeyboard: options.noKeyboard,
    onFiles: (files, call) => {
      void handleFiles(files, call);
    },
  });

  return {
    instanceId,
    files: engine.files,
    file: engine.file,
    phase: engine.phase,
    progress: engine.progress,
    error: engine.error,
    isPending: engine.isPending,
    policy: { ...routePolicy, maxFiles },
    resumable: options.uploadStore != null,
    disabled: options.disabled ?? false,
    handleFiles,
    open: intake.open,
    retry,
    cancel: engine.cancel,
    detach: engine.detach,
    reset: engine.reset,
    getRootProps: intake.getRootProps,
    getDropTargetProps: intake.getDropTargetProps,
    getInputProps: intake.getInputProps,
    isDragActive: intake.isDragActive,
    isDragAccept: intake.isDragAccept,
    isDragReject: intake.isDragReject,
    fileRejections: engine.fileRejections,
  };
}

function toFileArray(files: FileList | readonly File[] | File | null): File[] {
  if (files == null) return [];
  if (files instanceof File) return [files];
  return Array.from(files);
}
