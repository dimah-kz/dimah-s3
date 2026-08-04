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
  UploadHooks,
  UploadPhase,
  UploadProgress,
  UploadResult,
  UploadRequestOptions,
} from "../types";
import { uploadFile } from "../upload";

/** Options for {@link useUpload}. */
export type UseUploadOptions = UploadConfig &
  UploadHooks & {
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
  };

export type UseUploadState = {
  /** Current upload phase. */
  phase: UploadPhase;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Error message, or `null`. */
  error: string | null;
  /** Result after success, or `null`. */
  result: UploadResult | null;
  /** Name of the file being uploaded. */
  fileName: string | null;
  /** Size of the file being uploaded in bytes. */
  fileSize: number | null;
};

export type UseUploadReturn = UseUploadState & {
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
   * Stop the upload and — when multipart with `uploadStore` is active —
   * preserve S3 parts and the store entry for a future resume.
   *
   * Compared to `cancel()`:
   * - Does **not** call `AbortMultipartUpload` (parts stay on S3).
   * - Does **not** remove the `uploadStore` entry.
   * - Does **not** fire the `onCancel` callback.
   *
   * The next call to `upload(sameFile, sameKey)` will detect the stored
   * `uploadId`, verify the existing parts via `listParts`, and continue
   * uploading from where it stopped.
   *
   * For **simple uploads** or multipart **without** `uploadStore`, this is
   * identical to `cancel()` — there is no S3 state worth preserving.
   *
   * Intended for custom UIs that want to offer a "save for later / resume"
   * workflow.
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

const INITIAL_STATE: UseUploadState = {
  phase: "idle",
  progress: INITIAL_PROGRESS,
  error: null,
  result: null,
  fileName: null,
  fileSize: null,
};

type ActiveUpload = {
  file: File;
  objectKey: string;
  /** S3 key as returned by the server (may differ from objectKey). */
  serverKey: string;
  uploadId?: string;
  bucket?: string;
  requestOptions?: UploadRequestOptions;
};

export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const [state, setState] = useState<UseUploadState>(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const formatValidateFileError = useFormatValidateFileError();
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  /** Tracks the in-flight upload so cancel/detach can access uploadId and key. */
  const activeUploadRef = useRef<ActiveUpload | null>(null);
  /** Set before aborting so the AbortError catch skips cancel callbacks. */
  const detachingRef = useRef(false);
  const speedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker()),
  );

  const upload = useCallback(
    async (
      file: File,
      objectKey: string,
      requestOptions?: UploadRequestOptions,
    ) => {
      setState({
        ...INITIAL_STATE,
        phase: "validating",
        fileName: file.name,
        fileSize: file.size,
      });

      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useUpload or wrap with <S3Provider>.",
        );

      const validationError = validateFile(file, {
        accept: opts.accept,
        maxFileSize: opts.maxFileSize,
      });
      if (validationError) {
        const message = formatValidateFileError(validationError);
        setState((s) => ({ ...s, phase: "error", error: message }));
        opts.onError?.(file, new Error(message), "validating");
        return;
      }

      if (opts.beforeUpload) {
        const allowed = await opts.beforeUpload(file);
        if (!allowed) {
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Upload blocked by beforeUpload hook",
          }));
          opts.onError?.(file, new Error("blocked"), "validating");
          return;
        }
      }

      speedUpdaterRef.current.reset();
      setState((s) => ({ ...s, phase: "presigning" }));
      opts.onUploadStart?.(file, objectKey);

      const controller = new AbortController();
      abortRef.current = controller;
      activeUploadRef.current = {
        file,
        objectKey,
        serverKey: objectKey,
        bucket: requestOptions?.bucket,
        requestOptions,
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
              setState((s) => ({ ...s, progress: p }));
              opts.onProgress?.(file, p);
            },
            onPhaseChange: (phase) => setState((s) => ({ ...s, phase })),
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
          requestOptions,
        );

        setState((s) => ({
          ...s,
          phase: "success",
          result,
          progress: { loaded: file.size, total: file.size, percent: 100 },
        }));
        await opts.onSuccess?.(file, result);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (detachingRef.current) {
            detachingRef.current = false;
            return;
          }
          opts.onCancel?.(file);
          setState(INITIAL_STATE);
          return;
        }
        const message = err instanceof Error ? err.message : "Upload failed";
        setState((s) => ({ ...s, phase: "error", error: message }));
        opts.onError?.(file, err, "uploading");
      } finally {
        abortRef.current = null;
        activeUploadRef.current = null;
      }
    },
    [apiRef, optsRef, formatValidateFileError],
  );

  const cancel = useCallback(() => {
    const opts = optsRef.current;
    const api = opts.api ?? apiRef.current;
    const active = activeUploadRef.current;
    abortRef.current?.abort();
    if (active && api) {
      const { objectKey, serverKey, uploadId, bucket } = active;
      const store = opts.uploadStore;
      if (store != null && store !== false) {
        void Promise.resolve(store.delete(objectKey)).catch(() => {});
      }
      if (uploadId) {
        api.multipart
          .abort({ key: serverKey, uploadId, bucket })
          .catch(() => {});
      }
    }
    setState(INITIAL_STATE);
  }, [apiRef, optsRef]);

  const detach = useCallback(() => {
    const active = activeUploadRef.current;
    if (!active) return;
    // Signal the AbortError catch not to fire onCancel or re-reset state.
    detachingRef.current = true;
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, upload, cancel, detach, reset };
}
