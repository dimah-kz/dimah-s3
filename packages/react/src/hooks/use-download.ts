"use client";

import { useCallback, useContext, useRef } from "react";
import type { DimahS3Error, S3Api, S3RouteName } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { createSpeedTracker } from "@/helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "@/helpers/throttled-speed";
import { useLiveRef } from "@/internal-helpers";
import { useImmerState } from "@/store/use-immer-state";
import { hookBlockedError, isAbortError, toHookError } from "@/types/error";
import type { UploadProgress } from "@/types/upload";
import type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadHooks,
} from "@/types/download";

export type {
  DownloadPhase,
  DownloadHooks,
  FetchDownloadPhase,
  FetchDownloadProgress,
  FetchDownloadHooks,
} from "@/types/download";

type SharedDownloadOptions = {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Named server route (`dimahS3({ routes })`). */
  route: S3RouteName;
  /** Content-Disposition for the GET. */
  disposition?: "inline" | "attachment";
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
  /** `true` while the URL is being signed (`phase === "presigning"`). */
  isPending: boolean;
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
  /** `true` while bytes are transferring (`phase === "downloading"`). */
  isDownloading: boolean;
  /**
   * `true` while the download is in-flight (`presigning` or `downloading`).
   */
  isPending: boolean;
  /** Presign, fetch bytes, and save via the browser. */
  download: (key: string, downloadName?: string) => Promise<void>;
  /** Abort the active download. */
  cancel: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

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
  options: UseNavigateDownloadOptions,
): UseNavigateDownloadReturn;
export function useDownload(
  options: UseFetchDownloadOptions,
): UseFetchDownloadReturn;
export function useDownload(
  options: UseDownloadOptions,
): UseNavigateDownloadReturn | UseFetchDownloadReturn {
  const [state, patch, replace] = useImmerState(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const downloadKeyRef = useRef<string | null>(null);
  const resettingRef = useRef(false);
  const speedUpdaterRef = useRef(
    createThrottledSpeedUpdater(createSpeedTracker()),
  );

  const presign = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current as UseNavigateDownloadOptions;
      const api = opts.api ?? apiRef.current;
      if (!api) throw new Error(missingApiMessage("useDownload"));
      patch((draft) => {
        draft.phase = "presigning";
        draft.error = null;
        draft.url = null;
        draft.expiresIn = null;
      });
      try {
        const result = await api.download({
          route: opts.route,
          key,
          fileName: downloadName,
          ...(opts.disposition ? { disposition: opts.disposition } : {}),
        });
        patch((draft) => {
          draft.phase = "idle";
          draft.error = null;
          draft.url = result.url;
          draft.expiresIn = result.expiresIn;
        });
        return { url: result.url, expiresIn: result.expiresIn };
      } catch (err) {
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Download failed");
          draft.url = null;
          draft.expiresIn = null;
        });
        opts.onError?.(key, err);
        return null;
      }
    },
    [apiRef, optsRef, patch],
  );

  const downloadNavigate = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current as UseNavigateDownloadOptions;
      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          patch((draft) => {
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
    [optsRef, presign, patch],
  );

  const downloadFetch = useCallback(
    async (key: string, downloadName?: string) => {
      const fallback = key.split("/").pop() ?? key;
      const opts = optsRef.current as UseFetchDownloadOptions;
      const api = opts.api ?? apiRef.current;
      if (!api) throw new Error(missingApiMessage("useDownload"));
      downloadKeyRef.current = key;

      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          patch((draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Download blocked by beforeDownload hook",
            );
          });
          opts.onError?.(key, new Error("blocked"), "presigning");
          return;
        }
      }

      abortRef.current?.abort();
      const generation = ++generationRef.current;
      const isCurrent = () => generation === generationRef.current;

      patch((draft) => {
        draft.phase = "presigning";
        draft.progress = { ...INITIAL_PROGRESS };
        draft.error = null;
        draft.fileName = downloadName ?? null;
        draft.fileSize = null;
      });

      try {
        const { url } = await api.download({
          route: opts.route,
          key,
          fileName: downloadName,
          ...(opts.disposition ? { disposition: opts.disposition } : {}),
        });
        if (!isCurrent()) return;
        patch((draft) => {
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
        patch((draft) => {
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
          if (!isCurrent()) return;
          patch((draft) => {
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

        if (!isCurrent()) return;
        patch((draft) => {
          draft.phase = "success";
          draft.fileSize = blob.size;
          draft.progress = {
            loaded: blob.size,
            total: blob.size,
            percent: 100,
          };
        });
        try {
          await opts.onSuccess?.(key, name ?? fallback);
        } catch (err) {
          opts.onError?.(key, err, "success");
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (isAbortError(err)) {
          if (!resettingRef.current) opts.onCancel?.(key);
          resettingRef.current = false;
          replace(INITIAL_STATE);
          return;
        }
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Download failed");
        });
        opts.onError?.(key, err, "downloading");
      } finally {
        if (isCurrent()) abortRef.current = null;
      }
    },
    [apiRef, optsRef, patch, replace],
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
    const key = downloadKeyRef.current;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    downloadKeyRef.current = null;
    const opts = optsRef.current as UseFetchDownloadOptions;
    if (key && opts.mode === "fetch") opts.onCancel?.(key);
    replace(INITIAL_STATE);
  }, [optsRef, replace]);

  const reset = useCallback(() => {
    resettingRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  if (options.mode === "fetch") {
    const isDownloading = state.phase === "downloading";
    const isPending =
      state.phase === "presigning" || state.phase === "downloading";
    return {
      phase: state.phase,
      progress: state.progress,
      error: state.error,
      fileName: state.fileName,
      fileSize: state.fileSize,
      isDownloading,
      isPending,
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
    isPending: state.phase === "presigning",
    download,
    presign,
    reset,
  };
}
