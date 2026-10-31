"use client";

import { useCallback, useContext, useId } from "react";
import type { S3Api } from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { abortable } from "@/internal/abortable";
import { startBrowserDownload } from "@/internal/browser-download";
import { runAfterCallback, runBeforeCallback } from "@/internal/callbacks";
import { requireApi, toClientError } from "@/internal/client-error";
import { useLiveRef, useOperationStore } from "@/internal/hooks";
import type { OperationClaim } from "@/internal/operations";
import { mapWithConcurrency } from "@/internal/pool";
import type {
  DownloadOperation,
  DownloadOptions,
  DownloadOutcome,
  PresignManyResult,
  PresignOptions,
  UseDownloadOptions,
  UseDownloadReturn,
} from "@/types/download";

/** Keys `presignMany` signs at once. */
const PRESIGN_MANY_CONCURRENCY = 4;

/**
 * Presigns objects and hands the URLs to the browser, which saves or opens
 * them as the response's `Content-Disposition` says. Keys run in parallel,
 * and each `download` call records an operation.
 */
export function useDownload(options: UseDownloadOptions): UseDownloadReturn {
  const instanceId = useId();
  const contextApi = useContext(S3Context);
  const optionsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const { store, operations, pendingKeys, get } = useOperationStore<
    DownloadOperation,
    DownloadOutcome
  >();

  const resolveApi = useCallback(
    () => requireApi(optionsRef.current.api ?? apiRef.current, "useDownload"),
    [apiRef, optionsRef],
  );

  const sign = useCallback(
    (
      api: S3Api,
      key: string,
      request: PresignOptions,
      signal?: AbortSignal,
    ) => {
      const { route, disposition } = optionsRef.current;
      return api.download(
        {
          route,
          key,
          name: request.fileName,
          disposition,
          expiresIn: request.expiresIn,
        },
        { signal },
      );
    },
    [optionsRef],
  );

  const presign = useCallback(
    async (
      key: string,
      request: PresignOptions = {},
    ): Promise<DownloadOutcome> => {
      const api = resolveApi();
      const before = await runBeforeCallback(
        "beforeDownload",
        optionsRef.current.beforeDownload,
        key,
      );
      if (before.status !== "allowed") return { key, ...before };
      try {
        return { status: "success", key, data: await sign(api, key, request) };
      } catch (error) {
        return { status: "error", key, error: toClientError(error) };
      }
    },
    [optionsRef, resolveApi, sign],
  );

  const presignMany = useCallback(
    async (files: readonly ({ key: string } & PresignOptions)[]) => {
      const outcomes = await mapWithConcurrency(
        files,
        PRESIGN_MANY_CONCURRENCY,
        ({ key, ...request }) => presign(key, request),
      );
      const result: PresignManyResult = { signed: [], failed: [], blocked: [] };
      for (const outcome of outcomes) {
        if (outcome.status === "success") {
          result.signed.push(outcome.data);
        } else if (outcome.status === "error") {
          result.failed.push({ key: outcome.key, error: outcome.error });
        } else {
          result.blocked.push(outcome.key);
        }
      }
      return result;
    },
    [presign],
  );

  const navigate = useCallback(
    async (
      call: OperationClaim<DownloadOperation, DownloadOutcome>,
      fileName: string | undefined,
    ): Promise<DownloadOutcome> => {
      const { key, signal } = call;
      const api = resolveApi();
      const base = { fileName: fileName ?? null, error: null, result: null };
      try {
        const before = await abortable(
          runBeforeCallback(
            "beforeDownload",
            optionsRef.current.beforeDownload,
            key,
          ),
          signal,
        );
        if (before.status === "blocked") return { status: "blocked", key };
        if (before.status === "error") {
          call.publish({ ...base, phase: "error", error: before.error });
          return { status: "error", key, error: before.error };
        }

        call.publish({ ...base, phase: "presigning" });
        const data = await sign(api, key, { fileName }, signal);
        signal.throwIfAborted();
        startBrowserDownload(data.url);
        call.update({ phase: "success", result: data });
        return { status: "success", key, data };
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
    [optionsRef, resolveApi, sign],
  );

  const download = useCallback(
    (key: string, { fileName }: DownloadOptions = {}) =>
      store.run(
        key,
        (call) => navigate(call, fileName),
        (outcome) => reportOutcome(optionsRef.current, outcome),
      ),
    [navigate, optionsRef, store],
  );

  const cancel = useCallback((key?: string) => store.cancel(key), [store]);
  const reset = useCallback((key?: string) => store.reset(key), [store]);

  return {
    mode: "navigate",
    instanceId,
    operations,
    get,
    pendingKeys,
    isPending: pendingKeys.length > 0,
    download,
    presign,
    presignMany,
    cancel,
    reset,
  };
}

/**
 * Runs the after-callbacks for one settled `download` call, once its key is
 * free, so a callback can download the same key again.
 */
async function reportOutcome(
  { onError, onSuccess, onSettled }: UseDownloadOptions,
  outcome: DownloadOutcome,
): Promise<void> {
  if (outcome.status === "error") {
    await runAfterCallback(onError, outcome.error, outcome.key);
  } else if (outcome.status === "success") {
    await runAfterCallback(onSuccess, outcome.data, outcome.key);
  }
  await runAfterCallback(onSettled, outcome);
}
