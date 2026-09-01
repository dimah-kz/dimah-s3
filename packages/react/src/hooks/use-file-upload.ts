"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import type { S3Api } from "@dimah-s3/core";
import { APIError, validateFile } from "@dimah-s3/core";
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
  UploadProgress,
  UploadRequestOptions,
  UploadPhase,
  UploadFileState,
  UploadHooks,
} from "@/types";
import { multipartResumeKey } from "@/upload/resume-key";
import { uploadFiles } from "@/upload";
import { DEFAULT_MAX_FILES } from "@/upload/constants";
import { hookBlockedError, isAbortError, toHookError } from "@/types/error";
import { resolveRouteUploadPolicy } from "@/helpers/load-route-catalog";

/** @internal Options for the upload engine used by {@link useUpload}. */
export type UseFileUploadOptions = FileUploadConfig &
  UploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
    /** Static request options applied to all files. */
    uploadOptions?: UploadRequestOptions;
    /** Per-file request options (overrides `uploadOptions`). */
    getUploadOptions?: (file: File) => UploadRequestOptions;
  };

export type UseFileUploadState = {
  phase: UploadPhase;
  files: UploadFileState[];
  progress: UploadProgress;
  error: APIError | null;
};

export type UseFileUploadReturn = UseFileUploadState & {
  /** First file in the batch, or `null`. */
  file: UploadFileState | null;
  /** `true` while bytes are transferring (`phase === "uploading"`). */
  isUploading: boolean;
  /**
   * `true` while the upload is in-flight (`validating`, `presigning`,
   * `uploading`, or `finalizing`).
   */
  isPending: boolean;
  /** Upload one or more files. The server generates each object key. */
  upload: (files: File | File[]) => Promise<void>;
  /**
   * Abort all in-flight uploads and clean up multipart / store resources.
   */
  cancel: () => void;
  /**
   * Stop uploads but preserve multipart store entries for resume.
   */
  detach: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: UseFileUploadState = {
  phase: "idle",
  files: [],
  progress: INITIAL_PROGRESS,
  error: null,
};

const PENDING_PHASES: ReadonlySet<UploadPhase> = new Set([
  "validating",
  "presigning",
  "uploading",
  "finalizing",
]);

function generateId() {
  return crypto.randomUUID();
}

function normalizeFiles(files: File | File[]): File[] {
  return Array.isArray(files) ? files : [files];
}

type ActiveUpload = {
  resumeKey: string;
  serverKey: string;
  uploadId?: string;
};

/** @internal Engine for {@link useUpload}. Not a public hook. */
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
  const resettingRef = useRef(false);
  const detachingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeUploadsRef = useRef<Map<string, ActiveUpload>>(new Map());
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

  const abortMultipartSessions = useCallback(() => {
    const opts = optsRef.current;
    const api = opts.api ?? apiRef.current;
    const uploadStore = opts.uploadStore;
    for (const active of activeUploadsRef.current.values()) {
      if (uploadStore != null && uploadStore !== false) {
        void Promise.resolve(uploadStore.delete(active.resumeKey)).catch(
          () => {},
        );
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
    }
    activeUploadsRef.current.clear();
  }, [apiRef, optsRef]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      abortMultipartSessions();
      revokeAllPreviews();
    },
    [abortMultipartSessions, revokeAllPreviews],
  );

  const upload = useCallback(
    async (input: File | File[]) => {
      const files = normalizeFiles(input);
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useUpload or wrap with <S3Provider>.",
        );

      const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

      patch((draft) => {
        draft.phase = "validating";
        draft.error = null;
      });

      const policy = await resolveRouteUploadPolicy(api, opts.route, {
        accept: opts.accept,
        maxFileSize: opts.maxFileSize,
        multipart: opts.multipart,
        checksum: opts.checksum,
      });

      if (maxFiles > 0 && files.length > maxFiles) {
        const msg = `Too many files. Maximum is ${maxFiles}.`;
        patch((draft) => {
          draft.phase = "error";
          draft.error = new APIError("BAD_REQUEST", { message: msg });
        });
        opts.onError?.(new Error(msg), "validating");
        return;
      }

      for (const file of files) {
        const validationError = validateFile(file, {
          accept: policy.accept,
          maxFileSize: policy.maxFileSize,
        });
        if (validationError) {
          const detail = formatValidateFileError(validationError);
          const msg = `${file.name}: ${detail}`;
          const error = new APIError("BAD_REQUEST", { message: msg });
          revokeAllPreviews();
          const previewUrl = createImagePreviewUrl(file);
          if (previewUrl) previewUrlsRef.current = [previewUrl];
          patch((draft) => {
            draft.phase = "error";
            draft.error = error;
            draft.files = [
              {
                id: generateId(),
                name: file.name,
                size: file.size,
                type: file.type,
                previewUrl,
                status: "error",
                progress: { loaded: 0, total: file.size, percent: 0 },
                error,
                result: null,
              },
            ];
          });
          opts.onError?.(new Error(msg), "validating");
          return;
        }
      }

      abortRef.current?.abort();
      abortMultipartSessions();
      const generation = ++generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const isCurrent = () => generation === generationRef.current;

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(files);
        if (controller.signal.aborted) {
          if (!isCurrent()) return;
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
          opts.onError?.(new Error("blocked"), "validating");
          return;
        }
      }

      if (controller.signal.aborted) {
        if (!isCurrent()) return;
        abortRef.current = null;
        if (detachingRef.current) detachingRef.current = false;
        else if (resettingRef.current) resettingRef.current = false;
        else opts.onCancel?.();
        return;
      }

      revokeAllPreviews();
      const nextPreviewUrls: string[] = [];
      const items: Array<{ id: string; file: File }> = [];
      const fileStates: UploadFileState[] = [];
      const fileMap = new Map<string, File>();

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
          result: null,
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

      const singleFile = items.length === 1;
      patch((draft) => {
        draft.phase = singleFile ? "presigning" : "uploading";
        draft.files = fileStates;
        draft.progress = {
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

      let errorPhase: UploadPhase = singleFile ? "presigning" : "uploading";

      try {
        const results = await uploadFiles(
          api,
          items,
          {
            route: opts.route,
            multipart: policy.multipart,
            checksum: policy.checksum,
            concurrentParts: opts.concurrentParts,
            concurrentFiles: opts.concurrentFiles,
            retry: opts.retry,
            uploadStore: opts.uploadStore,
          },
          {
            onFileProgress: (id, progress) => {
              if (!isCurrent()) return;
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
            onFilePhaseChange: (_id, phase) => {
              if (!isCurrent()) return;
              errorPhase = phase;
              if (singleFile) {
                patch((draft) => {
                  draft.phase = phase;
                });
              }
            },
            onPartUpload: (id, partNumber, totalParts) => {
              const file = fileMap.get(id);
              if (file) opts.onPartUpload?.(file, partNumber, totalParts);
            },
            onFileSuccess: (id, result) => {
              if (!isCurrent()) return;
              activeUploadsRef.current.delete(id);
              patch((draft) => {
                const fileState = draft.files.find((f) => f.id === id);
                if (fileState) {
                  fileState.status = "success";
                  fileState.result = result;
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
              if (!isCurrent()) return;
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
              if (!isCurrent()) return;
              const p = totalSpeedUpdaterRef.current.apply(progress);
              patch((draft) => {
                draft.progress = p;
              });
              opts.onProgress?.(p);
            },
            onMultipartInit: (id, uploadId, serverKey) => {
              const active = activeUploadsRef.current.get(id);
              if (active) {
                active.uploadId = uploadId;
                active.serverKey = serverKey;
              }
              const file = fileMap.get(id);
              if (file) opts.onMultipartInit?.(file, uploadId);
            },
          },
          controller.signal,
          (file) => {
            const perFile = opts.getUploadOptions?.(file);
            if (!opts.uploadOptions) return perFile ?? {};
            return { ...opts.uploadOptions, ...perFile };
          },
        );

        if (!isCurrent()) return;

        const hasErrors = results.some((r) => r.status === "error");
        const successResults = results
          .filter((r) => r.result !== null)
          .map((r) => r.result!);

        patch((draft) => {
          draft.phase = hasErrors ? "error" : "success";
          draft.error = hasErrors
            ? new APIError("BAD_REQUEST", {
                message: `${results.filter((r) => r.status === "error").length} file(s) failed`,
              })
            : null;
          if (!hasErrors) {
            draft.progress = {
              loaded: draft.progress.total,
              total: draft.progress.total,
              percent: 100,
            };
          }
        });

        if (hasErrors) {
          opts.onError?.(
            new Error(
              `${results.filter((r) => r.status === "error").length} file(s) failed`,
            ),
            errorPhase,
          );
        } else {
          try {
            await opts.onSuccess?.(successResults);
          } catch (err) {
            opts.onError?.(err, "success");
          }
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (isAbortError(err)) {
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
        opts.onError?.(err, errorPhase);
      } finally {
        if (isCurrent()) {
          abortRef.current = null;
          activeUploadsRef.current.clear();
        }
      }
    },
    [
      abortMultipartSessions,
      apiRef,
      optsRef,
      formatValidateFileError,
      revokeAllPreviews,
      clearToIdle,
      patch,
    ],
  );

  const cancel = useCallback(() => {
    const hadWork =
      abortRef.current != null || activeUploadsRef.current.size > 0;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortMultipartSessions();
    abortRef.current = null;
    if (hadWork) optsRef.current.onCancel?.();
    clearToIdle();
  }, [abortMultipartSessions, optsRef, clearToIdle]);

  const detach = useCallback(() => {
    if (activeUploadsRef.current.size === 0 && !abortRef.current) return;
    detachingRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    activeUploadsRef.current.clear();
    clearToIdle();
  }, [clearToIdle]);

  const reset = useCallback(() => {
    resettingRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    activeUploadsRef.current.clear();
    clearToIdle();
  }, [clearToIdle]);

  return {
    ...state,
    file: state.files[0] ?? null,
    isUploading: state.phase === "uploading",
    isPending: PENDING_PHASES.has(state.phase),
    upload,
    cancel,
    detach,
    reset,
  };
}
