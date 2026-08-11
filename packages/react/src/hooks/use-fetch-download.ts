"use client";

import { useCallback, useContext, useRef } from "react";
import type { S3Api } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import { createSpeedTracker } from "../helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "../helpers/throttled-speed";
import type { FetchDownloadPhase, FetchDownloadHooks } from "../types/download";
import type { UploadProgress } from "../types/upload";
import { useLiveRef } from "../internal-helpers";
import {
  patchHookState,
  replaceHookState,
  useHookStoreInstance,
  useHookStoreShallow,
} from "../store/create-hook-store";

export type {
  FetchDownloadPhase,
  FetchDownloadProgress,
  FetchDownloadHooks,
} from "../types/download";

/** Options for {@link useFetchDownload}. */
export type UseFetchDownloadOptions = FetchDownloadHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Target bucket (overrides server default). */
  bucket?: string;
};

export type UseFetchDownloadState = {
  /** Current download phase. */
  phase: FetchDownloadPhase;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Error message, or `null`. */
  error: string | null;
  /** Resolved download filename. */
  fileName: string | null;
  /** Total file size in bytes. */
  fileSize: number | null;
};

export type UseFetchDownloadReturn = UseFetchDownloadState & {
  /** Presign, fetch bytes, and save via the browser. */
  download: (key: string, downloadName?: string) => Promise<void>;
  /** Abort the active download. */
  cancel: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: UseFetchDownloadState = {
  phase: "idle",
  progress: INITIAL_PROGRESS,
  error: null,
  fileName: null,
  fileSize: null,
};

export function useFetchDownload(
  options: UseFetchDownloadOptions,
): UseFetchDownloadReturn {
  const store = useHookStoreInstance(INITIAL_STATE);
  const state = useHookStoreShallow(store, (s) => ({
    phase: s.phase,
    progress: s.progress,
    error: s.error,
    fileName: s.fileName,
    fileSize: s.fileSize,
  }));
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  const resettingRef = useRef(false);
  const speedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker()),
  );

  const download = useCallback(
    async (key: string, downloadName?: string) => {
      const fallback = key.split("/").pop() ?? key;
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useFetchDownload or wrap with <S3Provider>.",
        );

      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          patchHookState(store, (draft) => {
            draft.phase = "error";
            draft.error = "Download blocked by beforeDownload hook";
          });
          opts.onError?.(key, new Error("blocked"), "presigning");
          return;
        }
      }

      patchHookState(store, (draft) => {
        draft.phase = "presigning";
        draft.progress = { ...INITIAL_PROGRESS };
        draft.error = null;
        draft.fileName = downloadName ?? null;
        draft.fileSize = null;
      });

      try {
        const { url } = await api.download(key, {
          fileName: downloadName,
          bucket: opts.bucket,
        });
        patchHookState(store, (draft) => {
          draft.phase = "downloading";
        });
        opts.onDownloadStart?.(key);

        speedUpdaterRef.current.reset();
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "File not found"
              : `Download failed (${res.status})`,
          );
        }

        const contentLength = Number(res.headers.get("content-length") || 0);
        const name =
          downloadName ??
          parseFileName(res.headers.get("content-disposition")) ??
          fallback;
        patchHookState(store, (draft) => {
          draft.fileName = name;
          draft.fileSize = contentLength || null;
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("ReadableStream not supported");

        const chunks: BlobPart[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          const percent =
            contentLength > 0 ? Math.round((loaded / contentLength) * 100) : 0;
          const progress = speedUpdaterRef.current.apply({
            loaded,
            total: contentLength,
            percent,
          });
          patchHookState(store, (draft) => {
            draft.progress = progress;
          });
          opts.onProgress?.(key, progress);
        }

        const blob = new Blob(chunks);
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = name ?? fallback;
        anchor.click();
        URL.revokeObjectURL(blobUrl);

        patchHookState(store, (draft) => {
          draft.phase = "success";
          draft.fileSize = blob.size;
          draft.progress = {
            loaded: blob.size,
            total: blob.size,
            percent: 100,
          };
        });
        await opts.onSuccess?.(key, name ?? fallback);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (!resettingRef.current) opts.onCancel?.(key);
          resettingRef.current = false;
          replaceHookState(store, INITIAL_STATE);
          return;
        }
        const message = err instanceof Error ? err.message : "Download failed";
        patchHookState(store, (draft) => {
          draft.phase = "error";
          draft.error = message;
        });
        opts.onError?.(key, err, "downloading");
      } finally {
        abortRef.current = null;
      }
    },
    [apiRef, optsRef, store],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    replaceHookState(store, INITIAL_STATE);
  }, [store]);

  const reset = useCallback(() => {
    resettingRef.current = true;
    abortRef.current?.abort();
    replaceHookState(store, INITIAL_STATE);
  }, [store]);

  return { ...state, download, cancel, reset };
}
