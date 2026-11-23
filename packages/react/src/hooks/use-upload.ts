"use client";

import { useCallback, useContext, useId, useMemo } from "react";
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
  type UploadCallInput,
  type UploadInputProps,
  type UploadRootProps,
} from "./use-file-intake";
import {
  useRouteUploadPolicyState,
  type UseRouteUploadPolicyReturn,
} from "./use-route-upload-policy";

export type {
  DropTargetProps,
  UploadCallInput,
  UploadInputProps,
  UploadRootProps,
};
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
  /**
   * `uploading` while a call is preparing or a file is in flight, then
   * `paused` while a file is paused, then how the settled files ended.
   */
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
   * once every file has ended; a paused file has not ended until it is
   * resumed and finishes, or is cancelled.
   */
  handleFiles: (
    files: FileList | readonly File[] | File | null,
    call?: UploadCallOptions,
  ) => Promise<UploadBatchResult>;
  /** Opens the native file picker. `call` applies to the picked files. */
  open: (call?: UploadCallOptions) => void;
  /**
   * Uploads the failed files `ids` (one id or several) again, or every
   * failed file. Files that came from one call go again as one call, with
   * that call's options: they are validated again, and `beforeUpload` and
   * `onUploadStart` run once for them. Each keeps its place and `id` in the
   * queue, and a retry never replaces the queue. Under a `useUploadLimit`,
   * only the failed files that fit go again. Resolves like `handleFiles`;
   * with nothing to retry, at once and without callbacks.
   */
  retry: (ids?: string | readonly string[]) => Promise<UploadBatchResult>;
  /**
   * Pauses the files `ids` (one id or several), or every file, including
   * the files of a call still preparing. A paused file stays in the queue
   * with its progress and frees its upload slot. A file that is finalizing
   * finishes instead.
   */
  pause: (ids?: string | readonly string[]) => void;
  /**
   * Resumes the paused files `ids` (one id or several), or every paused
   * file. A multipart upload continues from the parts S3 already has, also
   * without an `uploadStore` while the page stays open; a single-shot upload
   * starts over. The request options resolved before the pause are sent
   * again.
   */
  resume: (ids?: string | readonly string[]) => void;
  /** Cancels the files `ids` (one id or several), or every file. */
  cancel: (ids?: string | readonly string[]) => void;
  /**
   * Stops every file, paused ones too, and removes them from the queue. An
   * `uploadStore` keeps their multipart uploads, so picking the same files
   * again resumes them, also after a reload.
   */
  detach: () => void;
  /**
   * Removes the settled files `ids` (one id or several), or every settled
   * file and the rejections. Running and paused files stay. Stable identity.
   */
  reset: (ids?: string | readonly string[]) => void;
  /**
   * Spread on a dropzone: drag and drop, paste, click and keyboard to open
   * the picker. `call` applies to the files it takes in.
   */
  getRootProps: <T extends UploadRootProps>(
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
  getInputProps: <T extends UploadInputProps>(props?: T) => T;
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
 * at a time, and each one can be paused with `pause(id)` or cancelled with
 * `cancel(id)`. A call's `uploadOptions` merge over the hook's: call fields
 * win, and `clientMetadata` merges key by key.
 *
 * The return value keeps its identity until the queue, the policy or a drag
 * changes, so it can go in effect dependencies and context values.
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
  const engine = useFileUpload(options, instanceId);
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
    (ids?: string | readonly string[]) => {
      if (catalogStatusRef.current === "error") reloadCatalog();
      return retryFiles(ids);
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

  const policy = useMemo(
    () => ({ ...routePolicy, maxFiles }),
    [routePolicy, maxFiles],
  );
  const resumable = options.uploadStore != null;
  const disabled = options.disabled ?? false;
  const { files, file, phase, progress, error, isPending, fileRejections } =
    engine;
  const { pause, resume, cancel, detach, reset } = engine;
  const {
    open,
    getRootProps,
    getDropTargetProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
  } = intake;

  return useMemo(
    () => ({
      instanceId,
      files,
      file,
      phase,
      progress,
      error,
      isPending,
      policy,
      resumable,
      disabled,
      handleFiles,
      open,
      retry,
      pause,
      resume,
      cancel,
      detach,
      reset,
      getRootProps,
      getDropTargetProps,
      getInputProps,
      isDragActive,
      isDragAccept,
      isDragReject,
      fileRejections,
    }),
    [
      instanceId,
      files,
      file,
      phase,
      progress,
      error,
      isPending,
      policy,
      resumable,
      disabled,
      handleFiles,
      open,
      retry,
      pause,
      resume,
      cancel,
      detach,
      reset,
      getRootProps,
      getDropTargetProps,
      getInputProps,
      isDragActive,
      isDragAccept,
      isDragReject,
      fileRejections,
    ],
  );
}

function toFileArray(files: FileList | readonly File[] | File | null): File[] {
  if (files == null) return [];
  if (files instanceof File) return [files];
  return Array.from(files);
}
