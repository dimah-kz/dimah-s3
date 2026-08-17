"use client";

import { useCallback, useContext, useRef } from "react";
import type { DimahS3Error, S3Api } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import { createSpeedTracker } from "../helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "../helpers/throttled-speed";
import { useLiveRef } from "../internal-helpers";
import {
  patchHookState,
  replaceHookState,
  useHookStoreInstance,
  useHookStoreShallow,
} from "../store/create-hook-store";
import { hookBlockedError, toHookError } from "../types/error";
import type { UploadProgress } from "../types/upload";
import type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadHooks,
} from "../types/download";

export type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadProgress,
  FetchDownloadHooks,
} from "../types/download";

type SharedDownloadOptions = {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Target bucket (overrides server default). */
  bucket?: string;
};

/** Options for {@link useDownload} in navigate mode (the default). */
export type UseNavigateDownloadOptions = SharedDownloadOptions &
  DownloadHooks & {
    /**
     * `"navigate"` (default) — presign then hand the URL to the browser.
     * `"fetch"` — stream bytes in the browser for progress and cancel.
     */
    mode?: "navigate";
  };

/** Options for {@link useDownload} with `{ mode: "fetch" }`. */
export type UseFetchDownloadOptions = SharedDownloadOptions &
  FetchDownloadHooks & {
    mode: "fetch";
  };

export type UseDownloadOptions =
  UseNavigateDownloadOptions | UseFetchDownloadOptions;

export type UseNavigateDownloadState = {
  /** Current download phase. */
  phase: DownloadPhase;
  /** Last error, or `null`. */
  error: DimahS3Error | null;
  /** Presigned URL — set after a successful presign, cleared on reset. */
  url: string | null;
  /** Validity window in seconds for the presigned URL. */
  expiresIn: number | null;
};

export type UseNavigateDownloadReturn = UseNavigateDownloadState & {
  /** Presign and trigger a native browser download. */
  download: (key: string, downloadName?: string) => Promise<void>;
  /** Fetch the presigned URL without triggering a browser download. */
  presign: (
    key: string,
    downloadName?: string,
  ) => Promise<{ url: string; expiresIn: number } | null>;
  /** Reset state to `idle`. */
  reset: () => void;
};

export type UseFetchDownloadState = {
  /** Current download phase. */
  phase: FetchDownloadPhase;
  /** Byte transfer progress. */
  progress: UploadProgress;
  /** Last error, or `null`. */
  error: DimahS3Error | null;
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

/** @deprecated Use {@link UseNavigateDownloadState}. */
export type UseDownloadState = UseNavigateDownloadState;
/** Default (navigate) return. Fetch mode is {@link UseFetchDownloadReturn}. */
export type UseDownloadReturn = UseNavigateDownloadReturn;

type InternalState = {
  phase: FetchDownloadPhase;
  error: DimahS3Error | null;
  url: string | null;
  expiresIn: number | null;
  progress: UploadProgress;
  fileName: string | null;
  fileSize: number | null;
};

const INITIAL_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };

const INITIAL_STATE: InternalState = {
  phase: "idle",
  error: null,
  url: null,
  expiresIn: null,
  progress: INITIAL_PROGRESS,
  fileName: null,
  fileSize: null,
};

function missingApiMessage(hook: string) {
  return `[dimah-s3] No S3Api found. Pass \`api\` to ${hook} or wrap with <S3Provider>.`;
}

export function useDownload(
  options?: UseNavigateDownloadOptions,
): UseNavigateDownloadReturn;
export function useDownload(
  options: UseFetchDownloadOptions,
): UseFetchDownloadReturn;
export function useDownload(
  options: UseDownloadOptions = {},
): UseNavigateDownloadReturn | UseFetchDownloadReturn {
  const store = useHookStoreInstance(INITIAL_STATE);
  const state = useHookStoreShallow(store, (s) => ({
    phase: s.phase,
    error: s.error,
    url: s.url,
    expiresIn: s.expiresIn,
    progress: s.progress,
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

  const presign = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current as UseNavigateDownloadOptions;
      const api = opts.api ?? apiRef.current;
      if (!api) throw new Error(missingApiMessage("useDownload"));
      patchHookState(store, (draft) => {
        draft.phase = "presigning";
        draft.error = null;
        draft.url = null;
        draft.expiresIn = null;
      });
      try {
        const result = await api.download(key, {
          fileName: downloadName,
          bucket: opts.bucket,
        });
        patchHookState(store, (draft) => {
          draft.phase = "idle";
          draft.error = null;
          draft.url = result.url;
          draft.expiresIn = result.expiresIn;
        });
        return { url: result.url, expiresIn: result.expiresIn };
      } catch (err) {
        patchHookState(store, (draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Download failed");
          draft.url = null;
          draft.expiresIn = null;
        });
        opts.onError?.(key, err);
        return null;
      }
    },
    [apiRef, optsRef, store],
  );

  const downloadNavigate = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current as UseNavigateDownloadOptions;
      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          patchHookState(store, (draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Download blocked by beforeDownload hook",
            );
            draft.url = null;
            draft.expiresIn = null;
          });
          opts.onError?.(key, new Error("blocked"));
          return;
        }
      }
      const result = await presign(key, downloadName);
      if (!result) return;
      window.location.href = result.url;
      opts.onInitiated?.(key);
    },
    [optsRef, presign, store],
  );

  const downloadFetch = useCallback(
    async (key: string, downloadName?: string) => {
      const fallback = key.split("/").pop() ?? key;
      const opts = optsRef.current as UseFetchDownloadOptions;
      const api = opts.api ?? apiRef.current;
      if (!api) throw new Error(missingApiMessage("useDownload"));

      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          patchHookState(store, (draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Download blocked by beforeDownload hook",
            );
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
        patchHookState(store, (draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Download failed");
        });
        opts.onError?.(key, err, "downloading");
      } finally {
        abortRef.current = null;
      }
    },
    [apiRef, optsRef, store],
  );

  const download = useCallback(
    async (key: string, downloadName?: string) => {
      if (optsRef.current.mode === "fetch") {
        await downloadFetch(key, downloadName);
        return;
      }
      await downloadNavigate(key, downloadName);
    },
    [downloadFetch, downloadNavigate, optsRef],
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

  if (options.mode === "fetch") {
    return {
      phase: state.phase,
      progress: state.progress,
      error: state.error,
      fileName: state.fileName,
      fileSize: state.fileSize,
      download,
      cancel,
      reset,
    };
  }

  return {
    phase: state.phase as DownloadPhase,
    error: state.error,
    url: state.url,
    expiresIn: state.expiresIn,
    download,
    presign,
    reset,
  };
}
