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
  FileUploadConfig,
  UploadFileInfo,
  UploadHooks,
  UploadPhase,
  UploadProgress,
  UploadResult,
  UploadRequestOptions,
} from "@/types";
import { multipartResumeKey } from "@/upload/resume-key";
import { uploadFile } from "@/upload";
import { hookBlockedError, isAbortError, toHookError } from "@/types/error";

/** Options for {@link useFileUpload}. */
export type UseFileUploadOptions = FileUploadConfig &
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
   * file identity was interrupted (e.g. via `detach()`), the engine will find
   * the stored `uploadId`, call `listParts`, and resume from the last completed
   * part rather than starting a new multipart upload.
   */
  upload: (file: File, requestOptions?: UploadRequestOptions) => Promise<void>;
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
  resumeKey: string;
  /** S3 key as returned by the server. */
  serverKey: string;
  uploadId?: string;
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
  const generationRef = useRef(0);
  /** Tracks the in-flight upload so cancel/detach can access uploadId and key. */
  const activeUploadRef = useRef<ActiveUpload | null>(null);
  /** Set before aborting so the AbortError catch skips cancel callbacks. */
  const detachingRef = useRef(false);
  /** Set by `reset()` so AbortError does not fire `onCancel`. */
  const resettingRef = useRef(false);
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

  const abortMultipartSession = useCallback(
    (active: ActiveUpload | null) => {
      if (!active) return;
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      const storeOpt = opts.uploadStore;
      if (storeOpt != null && storeOpt !== false) {
        void Promise.resolve(storeOpt.delete(active.resumeKey)).catch(() => {});
      }
      if (api && active.uploadId && active.serverKey) {
        api.multipart
          .abort({
            route: opts.route,
            key: active.serverKey,
            uploadId: active.uploadId,
          })
          .catch(() => {});
      }
    },
    [apiRef, optsRef],
  );

  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      abortMultipartSession(activeUploadRef.current);
      revokeCurrentPreview();
    },
    [abortMultipartSession, revokeCurrentPreview],
  );

  const upload = useCallback(
    async (file: File, requestOptions?: UploadRequestOptions) => {
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

      const mergedOptions = mergeRequestOptions(opts, file, requestOptions);
      const previous = activeUploadRef.current;
      abortRef.current?.abort();
      abortMultipartSession(previous);
      const generation = ++generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      activeUploadRef.current = {
        file,
        resumeKey: multipartResumeKey(opts.route, file),
        serverKey: "",
        requestOptions: mergedOptions,
      };

      const isCurrent = () => generation === generationRef.current;

      const stopIfAborted = (): boolean => {
        if (!controller.signal.aborted) return false;
        if (!isCurrent()) return true;
        abortRef.current = null;
        activeUploadRef.current = null;
        if (detachingRef.current) detachingRef.current = false;
        else if (resettingRef.current) resettingRef.current = false;
        else opts.onCancel?.(file);
        return true;
      };

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(file);
        if (stopIfAborted()) return;
        if (!allowed) {
          abortRef.current = null;
          activeUploadRef.current = null;
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

      if (stopIfAborted()) return;

      speedUpdaterRef.current.reset();
      patch((draft) => {
        draft.phase = "presigning";
      });
      opts.onUploadStart?.(file);
      let errorPhase: UploadPhase = "presigning";

      try {
        const result = await uploadFile(
          api,
          file,
          {
            route: opts.route,
            multipart: opts.multipart,
            concurrentParts: opts.concurrentParts,
            retry: opts.retry,
            uploadStore: opts.uploadStore,
          },
          {
            onProgress: (progress) => {
              if (!isCurrent()) return;
              const p = speedUpdaterRef.current.apply(progress);
              patch((draft) => {
                draft.progress = p;
              });
              opts.onProgress?.(file, p);
            },
            onPhaseChange: (phase) => {
              if (!isCurrent()) return;
              errorPhase = phase;
              patch((draft) => {
                draft.phase = phase;
              });
            },
            onPartUpload: (partNumber, totalParts) =>
              opts.onPartUpload?.(file, partNumber, totalParts),
            onMultipartInit: (uploadId, serverKey) => {
              if (activeUploadRef.current && isCurrent()) {
                activeUploadRef.current.uploadId = uploadId;
                activeUploadRef.current.serverKey = serverKey;
              }
              opts.onMultipartInit?.(file, uploadId);
            },
          },
          controller.signal,
          mergedOptions,
        );

        if (!isCurrent()) return;

        patch((draft) => {
          draft.phase = "success";
          draft.result = result;
          draft.progress = {
            loaded: file.size,
            total: file.size,
            percent: 100,
          };
        });
        try {
          await opts.onSuccess?.(file, result);
        } catch (err) {
          opts.onError?.(file, err, "success");
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (isAbortError(err)) {
          if (detachingRef.current) {
            detachingRef.current = false;
            return;
          }
          if (resettingRef.current) {
            resettingRef.current = false;
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
        opts.onError?.(file, err, errorPhase);
      } finally {
        if (isCurrent()) {
          abortRef.current = null;
          activeUploadRef.current = null;
        }
      }
    },
    [
      abortMultipartSession,
      apiRef,
      optsRef,
      formatValidateFileError,
      revokeCurrentPreview,
      clearToIdle,
      patch,
    ],
  );

  const cancel = useCallback(() => {
    const active = activeUploadRef.current;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortMultipartSession(active);
    abortRef.current = null;
    activeUploadRef.current = null;
    if (active) optsRef.current.onCancel?.(active.file);
    clearToIdle();
  }, [abortMultipartSession, optsRef, clearToIdle]);

  const detach = useCallback(() => {
    if (!activeUploadRef.current) return;
    detachingRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    activeUploadRef.current = null;
    clearToIdle();
  }, [clearToIdle]);

  const reset = useCallback(() => {
    resettingRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    activeUploadRef.current = null;
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
