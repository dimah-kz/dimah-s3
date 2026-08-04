"use client";

import { useCallback, useContext, useRef, useState } from "react";
import type { S3Api } from "@dimah-s3/core";
import { parseFileName } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import { createSpeedTracker } from "../helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "../helpers/throttled-speed";
import type { FetchDownloadPhase, FetchDownloadHooks } from "../types/download";
import type { UploadProgress } from "../types/upload";
import { useLiveRef } from "../internal-helpers";

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
  const [state, setState] = useState<UseFetchDownloadState>(INITIAL_STATE);
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
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Download blocked by beforeDownload hook",
          }));
          opts.onError?.(key, new Error("blocked"), "presigning");
          return;
        }
      }

      setState({
        phase: "presigning",
        progress: INITIAL_PROGRESS,
        error: null,
        fileName: downloadName ?? null,
        fileSize: null,
      });

      try {
        const { url } = await api.download(key, {
          fileName: downloadName,
          bucket: opts.bucket,
        });
        setState((s) => ({ ...s, phase: "downloading" }));
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
        setState((s) => ({
          ...s,
          fileName: name,
          fileSize: contentLength || null,
        }));

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
          setState((s) => ({ ...s, progress }));
          opts.onProgress?.(key, progress);
        }

        const blob = new Blob(chunks);
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = name ?? fallback;
        anchor.click();
        URL.revokeObjectURL(blobUrl);

        setState((s) => ({
          ...s,
          phase: "success",
          fileSize: blob.size,
          progress: { loaded: blob.size, total: blob.size, percent: 100 },
        }));
        await opts.onSuccess?.(key, name ?? fallback);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (!resettingRef.current) opts.onCancel?.(key);
          resettingRef.current = false;
          setState(INITIAL_STATE);
          return;
        }
        const message = err instanceof Error ? err.message : "Download failed";
        setState((s) => ({ ...s, phase: "error", error: message }));
        opts.onError?.(key, err, "downloading");
      } finally {
        abortRef.current = null;
      }
    },
    [apiRef, optsRef],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const reset = useCallback(() => {
    resettingRef.current = true;
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, download, cancel, reset };
}
