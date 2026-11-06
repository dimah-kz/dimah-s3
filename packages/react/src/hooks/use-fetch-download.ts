"use client";

import { useCallback, useContext, useId } from "react";
import { fileNameFromKey, parseFileName, s3Error } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { createSpeedTracker } from "@/helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "@/helpers/throttled-speed";
import { abortable } from "@/internal/abortable";
import { readResponseBlob, saveBlob } from "@/internal/browser-download";
import {
  notify,
  reportOperationOutcome,
  runBeforeCallback,
  runStartCallback,
} from "@/internal/callbacks";
import { requireApi, toClientError } from "@/internal/client-error";
import { useLiveRef, useOperationStore } from "@/internal/hooks";
import type { OperationClaim } from "@/internal/operations";
import { transferProgress } from "@/upload/progress";
import type {
  FetchDownloadOperation,
  FetchDownloadOptions,
  FetchDownloadOutcome,
  UseFetchDownloadOptions,
  UseFetchDownloadReturn,
} from "@/types/download";
import type { TransferProgress } from "@/types/operation";

/** The least time between two progress reports while a body streams. */
const PROGRESS_INTERVAL_MS = 100;

type FetchDownloadCall = OperationClaim<
  FetchDownloadOperation,
  FetchDownloadOutcome
>;

/**
 * Presigns objects, fetches their bytes with progress and saves them through
 * the browser. Keys run in parallel, and each call records an operation that
 * `cancel(key)` can abort.
 */
export function useFetchDownload(
  options: UseFetchDownloadOptions,
): UseFetchDownloadReturn {
  const instanceId = useId();
  const contextApi = useContext(S3Context);
  const optionsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const { store, operations, pendingKeys, get } = useOperationStore<
    FetchDownloadOperation,
    FetchDownloadOutcome
  >();

  const transfer = useCallback(
    async (
      call: FetchDownloadCall,
      fileName: string | undefined,
      fileSize: number | null,
    ): Promise<FetchDownloadOutcome> => {
      const { key, signal } = call;
      const opts = optionsRef.current;
      const api = requireApi(opts.api ?? apiRef.current, "useFetchDownload");
      const base = {
        fileName: fileName ?? null,
        fileSize,
        error: null,
        progress: transferProgress(0, fileSize ?? 0),
      };
      try {
        const before = await abortable(
          runBeforeCallback("beforeDownload", opts.beforeDownload, key),
          signal,
        );
        if (before.status === "blocked") return { status: "blocked", key };
        if (before.status === "error") {
          call.publish({ ...base, phase: "error", error: before.error });
          return { status: "error", key, error: before.error };
        }

        call.publish({ ...base, phase: "presigning" });
        const { url } = await api.download(
          {
            route: opts.route,
            key,
            name: fileName,
            disposition: opts.disposition,
          },
          { signal },
        );
        call.update({ phase: "downloading" });
        const startError = runStartCallback(
          "onDownloadStart",
          optionsRef.current.onDownloadStart,
          key,
        );
        if (startError) throw startError;

        const response = await fetchObject(url, signal);
        let total = declaredSize(response, fileSize);
        const name =
          fileName ??
          parseFileName(response.headers.get("content-disposition")) ??
          fileNameFromKey(key) ??
          key;
        call.update({ fileName: name, fileSize: total || null });

        const speed = createThrottledSpeedUpdater(createSpeedTracker());
        let reported: TransferProgress | null = null;
        let reportedAt = -Infinity;
        const report = (progress: TransferProgress) => {
          reported = progress;
          reportedAt = Date.now();
          call.update({ progress });
          notify(optionsRef.current.onProgress, progress, key);
        };
        const blob = await readResponseBlob(response, signal, (loaded) => {
          // A body longer than declared (a decoded gzip body, say) has no
          // known total from then on.
          if (total > 0 && loaded > total) total = 0;
          const progress = speed.apply(transferProgress(loaded, total));
          // Chunks arrive far faster than a UI can render, so progress is
          // reported at most every PROGRESS_INTERVAL_MS, and at the end.
          const done = total > 0 && loaded === total;
          if (done || Date.now() - reportedAt >= PROGRESS_INTERVAL_MS) {
            report(progress);
          }
        });
        signal.throwIfAborted();
        const final = transferProgress(blob.size, blob.size);
        if (!isSameProgress(reported, final)) {
          notify(optionsRef.current.onProgress, final, key);
        }
        saveBlob(blob, name);
        call.update({ phase: "success", fileSize: blob.size, progress: final });
        return {
          status: "success",
          key,
          data: { fileName: name, size: blob.size },
        };
      } catch (error) {
        if (signal.aborted) {
          call.update({ phase: "aborted" });
          return { status: "aborted", key };
        }
        const apiError = toClientError(error);
        call.update({ phase: "error", error: apiError });
        return { status: "error", key, error: apiError };
      }
    },
    [apiRef, optionsRef],
  );

  const download = useCallback(
    (key: string, { fileName, fileSize = null }: FetchDownloadOptions = {}) =>
      store.run(
        key,
        (call) => transfer(call, fileName, fileSize),
        (outcome) => reportOperationOutcome(optionsRef.current, outcome),
      ),
    [optionsRef, store, transfer],
  );

  const cancel = useCallback((key?: string) => store.cancel(key), [store]);
  const reset = useCallback((key?: string) => store.reset(key), [store]);

  return {
    mode: "fetch",
    instanceId,
    operations,
    get,
    pendingKeys,
    isPending: pendingKeys.length > 0,
    download,
    cancel,
    reset,
  };
}

/**
 * The body size `response` declares, else `fileSize`, else `0` (unknown).
 * An encoded body (`Content-Encoding` readable and not `identity`) decodes to
 * another size, so both are ignored then.
 */
function declaredSize(response: Response, fileSize: number | null): number {
  const encoding = response.headers.get("content-encoding")?.trim();
  if (encoding && encoding.toLowerCase() !== "identity") return 0;
  return Number(response.headers.get("content-length")) || fileSize || 0;
}

/** Whether `progress` already reported the byte counts of `next`. */
function isSameProgress(
  progress: TransferProgress | null,
  next: TransferProgress,
): boolean {
  return progress?.loaded === next.loaded && progress.total === next.total;
}

/**
 * Fetches `url`. A failed request becomes `NETWORK_ERROR`, and a non-2xx
 * response `DOWNLOAD_FAILED` with its status. Aborting rejects with the
 * signal's reason.
 */
async function fetchObject(url: string, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    signal.throwIfAborted();
    throw s3Error("NETWORK_ERROR", undefined, { cause: error });
  }
  if (!response.ok) {
    const { status } = response;
    throw s3Error("DOWNLOAD_FAILED", { status }, { status });
  }
  return response;
}
