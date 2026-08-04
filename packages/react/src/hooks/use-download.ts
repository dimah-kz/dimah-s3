"use client";

import { useCallback, useContext, useState } from "react";
import type { S3Api } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import { useLiveRef } from "../internal-helpers";

export type { DownloadPhase, DownloadHooks } from "../types/download";

import type { DownloadPhase, DownloadHooks } from "../types/download";

/** Options for {@link useDownload}. */
export type UseDownloadOptions = DownloadHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Target bucket (overrides server default). */
  bucket?: string;
};

export type UseDownloadState = {
  /** Current download phase. */
  phase: DownloadPhase;
  /** Error message, or `null`. */
  error: string | null;
  /** Presigned URL — set after a successful presign, cleared on reset. */
  url: string | null;
  /** Validity window in seconds for the presigned URL. */
  expiresIn: number | null;
};

export type UseDownloadReturn = UseDownloadState & {
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

const INITIAL_STATE: UseDownloadState = {
  phase: "idle",
  error: null,
  url: null,
  expiresIn: null,
};

export function useDownload(options: UseDownloadOptions): UseDownloadReturn {
  const [state, setState] = useState<UseDownloadState>(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);

  const presign = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useDownload or wrap with <S3Provider>.",
        );
      setState({
        phase: "presigning",
        error: null,
        url: null,
        expiresIn: null,
      });
      try {
        const result = await api.download(key, {
          fileName: downloadName,
          bucket: opts.bucket,
        });
        setState({
          phase: "idle",
          error: null,
          url: result.url,
          expiresIn: result.expiresIn,
        });
        return { url: result.url, expiresIn: result.expiresIn };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        setState({
          phase: "error",
          error: message,
          url: null,
          expiresIn: null,
        });
        opts.onError?.(key, err);
        return null;
      }
    },
    [apiRef, optsRef],
  );

  const download = useCallback(
    async (key: string, downloadName?: string) => {
      const opts = optsRef.current;
      if (opts.beforeDownload) {
        const allowed = await opts.beforeDownload(key);
        if (!allowed) {
          setState({
            phase: "error",
            error: "Download blocked by beforeDownload hook",
            url: null,
            expiresIn: null,
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
    [optsRef, presign],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, download, presign, reset };
}
