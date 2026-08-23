"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import type { S3Api } from "@dimah-s3/core";
import { DimahS3Error, validateFile } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { createSpeedTracker } from "@/helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "@/helpers/throttled-speed";
import { useFormatValidateFileError } from "@/helpers/format-validate-file-error";
import {
  createImagePreviewUrl,
  revokePreviewUrl,
} from "@/helpers/file-preview";
import { useLiveRef } from "@/internal-helpers";
import { useImmerState } from "@/store/use-immer-state";
import type {
  UploadConfig,
  UploadFileInfo,
  UploadHooks,
  UploadPhase,
  UploadProgress,
  UploadResult,
  UploadRequestOptions,
} from "@/types";
import { uploadFile } from "@/upload";
import { hookBlockedError, toHookError } from "@/types/error";

/** Options for {@link useFileUpload}. */
export type UseFileUploadOptions = UploadConfig &
  UploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
    /** Static request options applied to the upload. */
    uploadOptions?: UploadRequestOptions;
    /** Per-upload request options override. */
    getUploadOptions?: (file: File) => UploadRequestOptions;
  };

export type UseFileUploadState = {
  /** Current upload phase. */
  phase: UploadPhase;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Last error, or `null`. */
  error: DimahS3Error | null;
  /** Result after success, or `null`. */
  result: UploadResult | null;
  /** Display metadata for the selected file, or `null`. */
  fileInfo: UploadFileInfo | null;
};

export type UseFileUploadReturn = UseFileUploadState & {
  /** `true` while bytes are transferring (`phase === "uploading"`). */
  isUploading: boolean;
  /**
   * `true` while the upload is in-flight (`validating`, `presigning`,
   * `uploading`, or `finalizing`).
   */
  isPending: boolean;
  /**
   * Start an upload.
   *
   * Safe to call again after `success`, `error`, or `cancel` — state is reset
   * automatically before the new upload begins.
   *
   * If `uploadStore` is configured and a previous upload for the same
   * `objectKey` was interrupted (e.g. via `detach()`), the engine will find
   * the stored `uploadId`, call `listParts`, and resume from the last completed
   * part rather than starting a new multipart upload.
   */
  upload: (
    file: File,
    objectKey: string,
    requestOptions?: UploadRequestOptions,
  ) => Promise<void>;
  /**
   * Abort the upload and fully clean up all resources.
   *
   * - Stops the in-flight network request immediately.
   * - For multipart uploads: calls `AbortMultipartUpload` on S3 so incomplete
   *   parts are freed right away (instead of waiting for the bucket lifecycle
   *   policy to expire them).
   * - Removes the `uploadStore` entry if one was provided.
   * - Resets state to `idle`.
   *
   * Use this for a "Cancel" button that the user explicitly clicks to abandon
   * the upload entirely.
   */
  cancel: () => void;
  /**
   * Soft-stop: preserves S3 parts and store entry so a future `upload()` can
   * resume. For non-resumable uploads, identical to `cancel()`.
   * See `UseFileUploadReturn.detach` for full semantics.
   */
  detach: () => void;
  /**
   * Reset UI state to `idle` without touching any S3 or store resources.
   *
   * - Stops the in-flight network request if one is active.
   * - Does **not** call `AbortMultipartUpload`.
   * - Does **not** modify `uploadStore`.
   * - Does **not** fire `onCancel`.
   *
   * Use this to clear an error or success state from the UI, or when you
   * handle cleanup yourself outside this hook.
   */
  reset: () => void;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: UseFileUploadState = {
  phase: "idle",
  progress: INITIAL_PROGRESS,
  error: null,
  result: null,
  fileInfo: null,
};

const PENDING_PHASES: ReadonlySet<UploadPhase> = new Set([
  "validating",
  "presigning",
  "uploading",
  "finalizing",
]);

function mergeRequestOptions(
  hook: UseFileUploadOptions,
  file: File,
  requestOptions?: UploadRequestOptions,
): UploadRequestOptions | undefined {
  const merged = {
    ...hook.uploadOptions,
    ...hook.getUploadOptions?.(file),
    ...requestOptions,
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

type ActiveUpload = {
  file: File;
  objectKey: string;
  /** S3 key as returned by the server (may differ from objectKey). */
  serverKey: string;
  uploadId?: string;
  bucket?: string;
  requestOptions?: UploadRequestOptions;
};

export function useFileUpload(
  options: UseFileUploadOptions,
): UseFileUploadReturn {
  const [state, patch, replace] = useImmerState(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const formatValidateFileError = useFormatValidateFileError();
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  /** Tracks the in-flight upload so cancel/detach can access uploadId and key. */
  const activeUploadRef = useRef<ActiveUpload | null>(null);
  /** Set before aborting so the AbortError catch skips cancel callbacks. */
  const detachingRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const speedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker()),
  );

  const revokeCurrentPreview = useCallback(() => {
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const clearToIdle = useCallback(() => {
    revokeCurrentPreview();
    replace(INITIAL_STATE);
  }, [revokeCurrentPreview, replace]);

  useEffect(() => () => revokeCurrentPreview(), [revokeCurrentPreview]);

  const upload = useCallback(
    async (
      file: File,
      objectKey: string,
      requestOptions?: UploadRequestOptions,
    ) => {
      revokeCurrentPreview();
      const previewUrl = createImagePreviewUrl(file);
      previewUrlRef.current = previewUrl;

      const fileInfo: UploadFileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl,
      };

      patch((draft) => {
        draft.phase = "validating";
        draft.progress = { ...INITIAL_PROGRESS };
        draft.error = null;
        draft.result = null;
        draft.fileInfo = fileInfo;
      });

      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useFileUpload or wrap with <S3Provider>.",
        );

      const validationError = validateFile(file, {
        accept: opts.accept,
        maxFileSize: opts.maxFileSize,
      });
      if (validationError) {
        const message = formatValidateFileError(validationError);
        patch((draft) => {
          draft.phase = "error";
          draft.error = new DimahS3Error("BAD_REQUEST", { message });
        });
        opts.onError?.(file, new Error(message), "validating");
        return;
      }

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(file);
        if (!allowed) {
          patch((draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Upload blocked by beforeUpload hook",
            );
          });
          opts.onError?.(file, new Error("blocked"), "validating");
          return;
        }
      }

      speedUpdaterRef.current.reset();
      patch((draft) => {
        draft.phase = "presigning";
      });
      opts.onUploadStart?.(file, objectKey);

      const mergedOptions = mergeRequestOptions(opts, file, requestOptions);
      const controller = new AbortController();
      abortRef.current = controller;
      activeUploadRef.current = {
        file,
        objectKey,
        serverKey: objectKey,
        bucket: mergedOptions?.bucket,
        requestOptions: mergedOptions,
      };

      try {
        const result = await uploadFile(
          api,
          file,
          objectKey,
          {
            multipart: opts.multipart,
            multipartThreshold: opts.multipartThreshold,
            concurrentParts: opts.concurrentParts,
            partSize: opts.partSize,
            retry: opts.retry,
            uploadStore: opts.uploadStore,
          },
          {
            onProgress: (progress) => {
              const p = speedUpdaterRef.current.apply(progress);
              patch((draft) => {
                draft.progress = p;
              });
              opts.onProgress?.(file, p);
            },
            onPhaseChange: (phase) =>
              patch((draft) => {
                draft.phase = phase;
              }),
            onPartUpload: (partNumber, totalParts) =>
              opts.onPartUpload?.(file, partNumber, totalParts),
            onMultipartInit: (uploadId, serverKey) => {
              if (activeUploadRef.current) {
                activeUploadRef.current.uploadId = uploadId;
                activeUploadRef.current.serverKey = serverKey;
              }
              opts.onMultipartInit?.(file, uploadId);
            },
          },
          controller.signal,
          mergedOptions,
        );

        patch((draft) => {
          draft.phase = "success";
          draft.result = result;
          draft.progress = {
            loaded: file.size,
            total: file.size,
            percent: 100,
          };
        });
        await opts.onSuccess?.(file, result);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (detachingRef.current) {
            detachingRef.current = false;
            return;
          }
          opts.onCancel?.(file);
          clearToIdle();
          return;
        }
        const message = err instanceof Error ? err.message : "Upload failed";
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, message);
        });
        opts.onError?.(file, err, "uploading");
      } finally {
        abortRef.current = null;
        activeUploadRef.current = null;
      }
    },
    [
      apiRef,
      optsRef,
      formatValidateFileError,
      revokeCurrentPreview,
      clearToIdle,
      patch,
    ],
  );

  const cancel = useCallback(() => {
    const opts = optsRef.current;
    const api = opts.api ?? apiRef.current;
    const active = activeUploadRef.current;
    abortRef.current?.abort();
    if (active && api) {
      const { objectKey, serverKey, uploadId, bucket } = active;
      const storeOpt = opts.uploadStore;
      if (storeOpt != null && storeOpt !== false) {
        void Promise.resolve(storeOpt.delete(objectKey)).catch(() => {});
      }
      if (uploadId) {
        api.multipart
          .abort({ key: serverKey, uploadId, bucket })
          .catch(() => {});
      }
    }
    clearToIdle();
  }, [apiRef, optsRef, clearToIdle]);

  const detach = useCallback(() => {
    const active = activeUploadRef.current;
    if (!active) return;
    // Signal the AbortError catch not to fire onCancel or re-reset state.
    detachingRef.current = true;
    abortRef.current?.abort();
    clearToIdle();
  }, [clearToIdle]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearToIdle();
  }, [clearToIdle]);

  return {
    ...state,
    isUploading: state.phase === "uploading",
    isPending: PENDING_PHASES.has(state.phase),
    upload,
    cancel,
    detach,
    reset,
  };
}
