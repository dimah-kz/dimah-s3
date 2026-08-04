"use client";

import { useCallback, useContext, useRef, useState } from "react";
import type { S3Api } from "@dimah-s3/core";
import { validateFile } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import { createSpeedTracker } from "../helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "../helpers/throttled-speed";
import { useFormatValidateFileError } from "../helpers/format-validate-file-error";
import { useLiveRef } from "../internal-helpers";
import type {
  UploadConfig,
  UploadProgress,
  UploadRequestOptions,
  MultiUploadPhase,
  MultiUploadFileState,
  MultiUploadHooks,
} from "../types";
import { uploadFiles } from "../upload";

/** Options for {@link useMultiUpload}. */
export type UseMultiUploadOptions = UploadConfig &
  MultiUploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
    /** Static request options applied to all files. */
    uploadOptions?: UploadRequestOptions;
    /** Per-file request options (overrides `uploadOptions`). */
    getUploadOptions?: (file: File) => UploadRequestOptions;
  };

export type UseMultiUploadState = {
  /** Current batch upload phase. */
  phase: MultiUploadPhase;
  /** Per-file upload states. */
  files: MultiUploadFileState[];
  /** Aggregated progress across all files. */
  totalProgress: UploadProgress;
  /** Batch-level error message, or `null`. */
  error: string | null;
};

export type UseMultiUploadReturn = UseMultiUploadState & {
  /** Upload multiple files. */
  upload: (files: File[], resolveKey: (file: File) => string) => Promise<void>;
  /**
   * Abort all in-flight uploads and clean up multipart / store resources
   * (same semantics as {@link useUpload}'s `cancel`).
   */
  cancel: () => void;
  /**
   * Stop uploads but preserve multipart store entries for resume
   * (same semantics as {@link useUpload}'s `detach`).
   */
  detach: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: UseMultiUploadState = {
  phase: "idle",
  files: [],
  totalProgress: INITIAL_PROGRESS,
  error: null,
};

function generateId() {
  return crypto.randomUUID();
}

type ActiveMultiUpload = {
  objectKey: string;
  serverKey: string;
  uploadId?: string;
  bucket?: string;
};

export function useMultiUpload(
  options: UseMultiUploadOptions,
): UseMultiUploadReturn {
  const [state, setState] = useState<UseMultiUploadState>(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const formatValidateFileError = useFormatValidateFileError();
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  const resettingRef = useRef(false);
  const detachingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeUploadsRef = useRef<Map<string, ActiveMultiUpload>>(new Map());
  const fileSpeedUpdatersRef = useRef<
    Map<string, ReturnType<typeof createThrottledSpeedUpdater>>
  >(new Map());
  const totalSpeedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker(), 1000),
  );

  const upload = useCallback(
    async (files: File[], resolveKey: (file: File) => string) => {
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useMultiUpload or wrap with <S3Provider>.",
        );

      const items: Array<{
        id: string;
        file: File;
        objectKey: string;
      }> = [];
      const fileStates: MultiUploadFileState[] = [];
      const fileMap = new Map<string, File>();

      setState((s) => ({ ...s, phase: "validating", error: null }));

      if (opts.maxFiles && files.length > opts.maxFiles) {
        const msg = `Too many files. Maximum is ${opts.maxFiles}.`;
        setState((s) => ({ ...s, phase: "error", error: msg }));
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
          setState((s) => ({ ...s, phase: "error", error: msg }));
          opts.onError?.(new Error(msg));
          return;
        }
      }

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(files);
        if (!allowed) {
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Upload blocked by beforeUpload hook",
          }));
          opts.onError?.(new Error("blocked"));
          return;
        }
      }

      for (const file of files) {
        const id = generateId();
        const objectKey = resolveKey(file);
        items.push({ id, file, objectKey });
        fileMap.set(id, file);
        fileStates.push({
          id,
          fileName: file.name,
          fileSize: file.size,
          status: "pending",
          progress: { loaded: 0, total: file.size, percent: 0 },
          error: null,
        });
      }

      fileMapRef.current = fileMap;
      activeUploadsRef.current = new Map(
        items.map((item) => [
          item.id,
          {
            objectKey: item.objectKey,
            serverKey: item.objectKey,
            bucket:
              opts.getUploadOptions?.(item.file)?.bucket ??
              opts.uploadOptions?.bucket,
          },
        ]),
      );

      setState({
        phase: "uploading",
        files: fileStates,
        totalProgress: {
          loaded: 0,
          total: files.reduce((s, f) => s + f.size, 0),
          percent: 0,
        },
        error: null,
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

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const results = await uploadFiles(
          api,
          items,
          {
            multipart: opts.multipart,
            multipartThreshold: opts.multipartThreshold,
            concurrentParts: opts.concurrentParts,
            concurrentFiles: opts.concurrentFiles,
            partSize: opts.partSize,
            retry: opts.retry,
            uploadStore: opts.uploadStore,
          },
          {
            onFileProgress: (id, progress) => {
              const updater = fileSpeedUpdatersRef.current.get(id);
              const p = updater ? updater.apply(progress) : progress;
              setState((s) => ({
                ...s,
                files: s.files.map((f) =>
                  f.id === id ? { ...f, status: "uploading", progress: p } : f,
                ),
              }));
              const file = fileMap.get(id);
              if (file) opts.onFileProgress?.(file, p);
            },
            onFileSuccess: (id, result) => {
              activeUploadsRef.current.delete(id);
              setState((s) => ({
                ...s,
                files: s.files.map((f) =>
                  f.id === id
                    ? {
                        ...f,
                        status: "success",
                        progress: {
                          loaded: f.fileSize,
                          total: f.fileSize,
                          percent: 100,
                        },
                      }
                    : f,
                ),
              }));
              const file = fileMap.get(id);
              if (file) opts.onFileSuccess?.(file, result);
            },
            onFileError: (id, error) => {
              setState((s) => ({
                ...s,
                files: s.files.map((f) =>
                  f.id === id ? { ...f, status: "error", error } : f,
                ),
              }));
              const file = fileMap.get(id);
              if (file) opts.onFileError?.(file, error);
            },
            onTotalProgress: (progress) => {
              const p = totalSpeedUpdaterRef.current.apply(progress);
              setState((s) => ({ ...s, totalProgress: p }));
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

        setState((s) => ({
          ...s,
          phase: hasErrors ? "error" : "success",
          error: hasErrors
            ? `${results.filter((r) => r.status === "error").length} file(s) failed`
            : null,
          totalProgress: hasErrors
            ? s.totalProgress
            : {
                loaded: s.totalProgress.total,
                total: s.totalProgress.total,
                percent: 100,
              },
        }));

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
          setState(INITIAL_STATE);
          return;
        }
        const message = err instanceof Error ? err.message : "Upload failed";
        setState((s) => ({ ...s, phase: "error", error: message }));
        opts.onError?.(err);
      } finally {
        abortRef.current = null;
        activeUploadsRef.current.clear();
      }
    },
    [apiRef, optsRef, formatValidateFileError],
  );

  const cancel = useCallback(() => {
    const opts = optsRef.current;
    const api = opts.api ?? apiRef.current;
    abortRef.current?.abort();
    if (api) {
      const store = opts.uploadStore;
      for (const active of activeUploadsRef.current.values()) {
        if (store != null && store !== false) {
          void Promise.resolve(store.delete(active.objectKey)).catch(() => {});
        }
        if (active.uploadId) {
          api.multipart
            .abort({
              key: active.serverKey,
              uploadId: active.uploadId,
              bucket: active.bucket,
            })
            .catch(() => {});
        }
      }
    }
    activeUploadsRef.current.clear();
    setState(INITIAL_STATE);
  }, [apiRef, optsRef]);

  const detach = useCallback(() => {
    if (activeUploadsRef.current.size === 0) return;
    detachingRef.current = true;
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const reset = useCallback(() => {
    resettingRef.current = true;
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, upload, cancel, detach, reset };
}
