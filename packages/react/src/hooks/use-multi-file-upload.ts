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
  MultiFileUploadConfig,
  UploadProgress,
  UploadRequestOptions,
  MultiUploadPhase,
  MultiUploadFileState,
  MultiUploadHooks,
} from "@/types";
import { multipartResumeKey } from "@/upload/resume-key";
import { uploadFiles } from "@/upload";
import { hookBlockedError, toHookError } from "@/types/error";

/** Options for {@link useMultiFileUpload}. */
export type UseMultiFileUploadOptions = MultiFileUploadConfig &
  MultiUploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
    /** Static request options applied to all files. */
    uploadOptions?: UploadRequestOptions;
    /** Per-file request options (overrides `uploadOptions`). */
    getUploadOptions?: (file: File) => UploadRequestOptions;
  };

export type UseMultiFileUploadState = {
  /** Current batch upload phase. */
  phase: MultiUploadPhase;
  /** Per-file upload states. */
  files: MultiUploadFileState[];
  /** Aggregated progress across all files. */
  totalProgress: UploadProgress;
  /** Batch-level error, or `null`. */
  error: DimahS3Error | null;
};

export type UseMultiFileUploadReturn = UseMultiFileUploadState & {
  /** `true` while bytes are transferring (`phase === "uploading"`). */
  isUploading: boolean;
  /** `true` while the batch is in-flight (`validating` or `uploading`). */
  isPending: boolean;
  /** Upload multiple files. The server generates each object key. */
  upload: (files: File[]) => Promise<void>;
  /**
   * Abort all in-flight uploads and clean up multipart / store resources
   * (same semantics as {@link useFileUpload}'s `cancel`).
   */
  cancel: () => void;
  /**
   * Stop uploads but preserve multipart store entries for resume
   * (same semantics as {@link useFileUpload}'s `detach`).
   */
  detach: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: UseMultiFileUploadState = {
  phase: "idle",
  files: [],
  totalProgress: INITIAL_PROGRESS,
  error: null,
};

const PENDING_PHASES: ReadonlySet<MultiUploadPhase> = new Set([
  "validating",
  "uploading",
]);

function generateId() {
  return crypto.randomUUID();
}

type ActiveMultiUpload = {
  resumeKey: string;
  serverKey: string;
  uploadId?: string;
};

export function useMultiFileUpload(
  options: UseMultiFileUploadOptions,
): UseMultiFileUploadReturn {
  const [state, patch, replace] = useImmerState(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const formatValidateFileError = useFormatValidateFileError();
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  const resettingRef = useRef(false);
  const detachingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeUploadsRef = useRef<Map<string, ActiveMultiUpload>>(new Map());
  const previewUrlsRef = useRef<string[]>([]);
  const fileSpeedUpdatersRef = useRef<
    Map<string, ReturnType<typeof createThrottledSpeedUpdater>>
  >(new Map());
  const totalSpeedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker(), 1000),
  );

  const revokeAllPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) revokePreviewUrl(url);
    previewUrlsRef.current = [];
  }, []);

  const clearToIdle = useCallback(() => {
    revokeAllPreviews();
    replace(INITIAL_STATE);
  }, [revokeAllPreviews, replace]);

  useEffect(() => () => revokeAllPreviews(), [revokeAllPreviews]);

  const upload = useCallback(
    async (files: File[]) => {
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useMultiFileUpload or wrap with <S3Provider>.",
        );

      const items: Array<{
        id: string;
        file: File;
      }> = [];
      const fileStates: MultiUploadFileState[] = [];
      const fileMap = new Map<string, File>();

      patch((draft) => {
        draft.phase = "validating";
        draft.error = null;
      });

      if (opts.maxFiles && files.length > opts.maxFiles) {
        const msg = `Too many files. Maximum is ${opts.maxFiles}.`;
        patch((draft) => {
          draft.phase = "error";
          draft.error = new DimahS3Error("BAD_REQUEST", { message: msg });
        });
        opts.onError?.(new Error(msg));
        return;
      }

      for (const file of files) {
        const validationError = validateFile(file, {
          accept: opts.accept,
          maxFileSize: opts.maxFileSize,
        });
        if (validationError) {
          const detail = formatValidateFileError(validationError);
          const msg = `${file.name}: ${detail}`;
          patch((draft) => {
            draft.phase = "error";
            draft.error = new DimahS3Error("BAD_REQUEST", { message: msg });
          });
          opts.onError?.(new Error(msg));
          return;
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(files);
        if (controller.signal.aborted) {
          abortRef.current = null;
          if (detachingRef.current) detachingRef.current = false;
          else if (resettingRef.current) resettingRef.current = false;
          else opts.onCancel?.();
          return;
        }
        if (!allowed) {
          abortRef.current = null;
          patch((draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Upload blocked by beforeUpload hook",
            );
          });
          opts.onError?.(new Error("blocked"));
          return;
        }
      }

      if (controller.signal.aborted) {
        abortRef.current = null;
        if (detachingRef.current) detachingRef.current = false;
        else if (resettingRef.current) resettingRef.current = false;
        else opts.onCancel?.();
        return;
      }

      revokeAllPreviews();
      const nextPreviewUrls: string[] = [];

      for (const file of files) {
        const id = generateId();
        const previewUrl = createImagePreviewUrl(file);
        if (previewUrl) nextPreviewUrls.push(previewUrl);
        items.push({ id, file });
        fileMap.set(id, file);
        fileStates.push({
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl,
          status: "pending",
          progress: { loaded: 0, total: file.size, percent: 0 },
          error: null,
        });
      }

      previewUrlsRef.current = nextPreviewUrls;
      fileMapRef.current = fileMap;
      activeUploadsRef.current = new Map(
        items.map((item) => [
          item.id,
          {
            resumeKey: multipartResumeKey(opts.route, item.file),
            serverKey: "",
          },
        ]),
      );

      patch((draft) => {
        draft.phase = "uploading";
        draft.files = fileStates;
        draft.totalProgress = {
          loaded: 0,
          total: files.reduce((s, f) => s + f.size, 0),
          percent: 0,
        };
        draft.error = null;
      });

      opts.onUploadStart?.(files);

      fileSpeedUpdatersRef.current.clear();
      for (const item of items) {
        fileSpeedUpdatersRef.current.set(
          item.id,
          createThrottledSpeedUpdater(createSpeedTracker()),
        );
      }
      totalSpeedUpdaterRef.current.reset();

      try {
        const results = await uploadFiles(
          api,
          items,
          {
            route: opts.route,
            multipart: opts.multipart,
            concurrentParts: opts.concurrentParts,
            concurrentFiles: opts.concurrentFiles,
            retry: opts.retry,
            uploadStore: opts.uploadStore,
          },
          {
            onFileProgress: (id, progress) => {
              const updater = fileSpeedUpdatersRef.current.get(id);
              const p = updater ? updater.apply(progress) : progress;
              patch((draft) => {
                const fileState = draft.files.find((f) => f.id === id);
                if (fileState) {
                  fileState.status = "uploading";
                  fileState.progress = p;
                }
              });
              const file = fileMap.get(id);
              if (file) opts.onFileProgress?.(file, p);
            },
            onFileSuccess: (id, result) => {
              activeUploadsRef.current.delete(id);
              patch((draft) => {
                const fileState = draft.files.find((f) => f.id === id);
                if (fileState) {
                  fileState.status = "success";
                  fileState.progress = {
                    loaded: fileState.size,
                    total: fileState.size,
                    percent: 100,
                  };
                }
              });
              const file = fileMap.get(id);
              if (file) opts.onFileSuccess?.(file, result);
            },
            onFileError: (id, error) => {
              patch((draft) => {
                const fileState = draft.files.find((f) => f.id === id);
                if (fileState) {
                  fileState.status = "error";
                  fileState.error = error;
                }
              });
              const file = fileMap.get(id);
              if (file) opts.onFileError?.(file, error);
            },
            onTotalProgress: (progress) => {
              const p = totalSpeedUpdaterRef.current.apply(progress);
              patch((draft) => {
                draft.totalProgress = p;
              });
              opts.onProgress?.(p);
            },
            onMultipartInit: (id, uploadId, serverKey) => {
              const active = activeUploadsRef.current.get(id);
              if (active) {
                active.uploadId = uploadId;
                active.serverKey = serverKey;
              }
            },
          },
          controller.signal,
          (file) => {
            const perFile = opts.getUploadOptions?.(file);
            if (!opts.uploadOptions) return perFile ?? {};
            return { ...opts.uploadOptions, ...perFile };
          },
        );

        const hasErrors = results.some((r) => r.status === "error");
        const successResults = results
          .filter((r) => r.result !== null)
          .map((r) => r.result!);

        patch((draft) => {
          draft.phase = hasErrors ? "error" : "success";
          draft.error = hasErrors
            ? new DimahS3Error("BAD_REQUEST", {
                message: `${results.filter((r) => r.status === "error").length} file(s) failed`,
              })
            : null;
          if (!hasErrors) {
            draft.totalProgress = {
              loaded: draft.totalProgress.total,
              total: draft.totalProgress.total,
              percent: 100,
            };
          }
        });

        if (!hasErrors) {
          await opts.onSuccess?.(successResults);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (detachingRef.current) {
            detachingRef.current = false;
            return;
          }
          if (!resettingRef.current) opts.onCancel?.();
          resettingRef.current = false;
          clearToIdle();
          return;
        }
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Upload failed");
        });
        opts.onError?.(err);
      } finally {
        abortRef.current = null;
        activeUploadsRef.current.clear();
      }
    },
    [
      apiRef,
      optsRef,
      formatValidateFileError,
      revokeAllPreviews,
      clearToIdle,
      patch,
    ],
  );

  const cancel = useCallback(() => {
    const opts = optsRef.current;
    const api = opts.api ?? apiRef.current;
    abortRef.current?.abort();
    if (api) {
      const uploadStore = opts.uploadStore;
      for (const active of activeUploadsRef.current.values()) {
        if (uploadStore != null && uploadStore !== false) {
          void Promise.resolve(uploadStore.delete(active.resumeKey)).catch(
            () => {},
          );
        }
        if (active.uploadId && active.serverKey) {
          api.multipart
            .abort({
              route: opts.route,
              key: active.serverKey,
              uploadId: active.uploadId,
            })
            .catch(() => {});
        }
      }
    }
    activeUploadsRef.current.clear();
    clearToIdle();
  }, [apiRef, optsRef, clearToIdle]);

  const detach = useCallback(() => {
    if (activeUploadsRef.current.size === 0) return;
    detachingRef.current = true;
    abortRef.current?.abort();
    clearToIdle();
  }, [clearToIdle]);

  const reset = useCallback(() => {
    resettingRef.current = true;
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
