"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  s3Error,
  validateFile,
  type APIError,
  type RouteCatalogResponse,
  type S3Api,
} from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import {
  createImagePreviewUrl,
  revokePreviewUrl,
} from "@/helpers/file-preview";
import {
  loadRouteCatalog,
  mergeRouteUploadPolicy,
  resolveRouteUploadPolicy,
} from "@/helpers/load-route-catalog";
import { createSpeedTracker } from "@/helpers/speed-tracker";
import { createThrottledSpeedUpdater } from "@/helpers/throttled-speed";
import { abortable } from "@/internal/abortable";
import {
  hookFailed,
  notify,
  runAfterCallback,
  runBeforeCallback,
  runStartCallback,
} from "@/internal/callbacks";
import { requireApi, toClientError } from "@/internal/client-error";
import type { TransferProgress } from "@/types/operation";
import type {
  FileRejection,
  UploadBatchResult,
  UploadCallOptions,
  UploadFilePhase,
  UploadFileState,
  UploadPhase,
  UploadRequestInput,
  UploadRequestOptions,
  UploadResult,
  UseUploadOptions,
} from "@/types/upload";
import { uploadAbortReason } from "@/upload/abort";
import {
  DEFAULT_CONCURRENT_FILES,
  DEFAULT_MAX_FILES,
} from "@/upload/constants";
import { transferProgress } from "@/upload/progress";
import { uploadFile } from "@/upload/upload-file";

/** @internal The queue part of `UseUploadOptions`, without the intake flags. */
export type UseFileUploadOptions = Omit<
  UseUploadOptions,
  "disabled" | "noDrag" | "noClick" | "noKeyboard"
>;

/** @internal What {@link useFileUpload} returns to `useUpload`. */
export type UseFileUploadReturn = {
  /** Every file in the queue, in the order it was added. */
  files: readonly UploadFileState[];
  /** The first file, or `null`. */
  file: UploadFileState | null;
  /** `uploading` while a call is preparing or a file is in flight. */
  phase: UploadPhase;
  /** Bytes sent across every file in the queue. */
  progress: TransferProgress;
  /** The one failed file's error, or `PARTIAL_FAILURE` when several failed. */
  error: APIError | null;
  /** `true` while `phase` is `uploading`. */
  isPending: boolean;
  /** Files the newest call rejected for their type, size or count. */
  fileRejections: readonly FileRejection[];
  /**
   * Validates `files` against the route policy and uploads the valid ones.
   * Rejected files go to `onFileReject` and never enter the queue. When no
   * file is valid, the call ends there and runs only `onSettled`.
   */
  upload: (
    files: readonly File[],
    call?: UploadCallOptions,
  ) => Promise<UploadBatchResult>;
  /** Cancels one file by `id`, or every file and preparing call. */
  cancel: (id?: string) => void;
  /** Stops every file but keeps stored multipart uploads for resuming. */
  detach: () => void;
  /** Removes settled files and rejections. Running files keep going. */
  reset: () => void;
};

/**
 * @internal The upload queue behind `useUpload`.
 *
 * Every call loads the route catalog, validates its files, then runs
 * `beforeUpload` and `onUploadStart` once. Valid files share one pool of
 * `concurrentFiles` uploads across calls. Each file can be cancelled on its
 * own. A cancelled or detached file leaves the queue and counts as `aborted`.
 * Unmounting detaches the files whose call had an `uploadStore`, so they can
 * resume, and cancels the rest.
 */
export function useFileUpload(
  options: UseFileUploadOptions,
): UseFileUploadReturn {
  const contextApi = useContext(S3Context);
  const [queue] = useState(() => createUploadQueue(options, contextApi));
  const snapshot = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );

  useLayoutEffect(() => {
    queue.configure(options, contextApi);
  });
  useEffect(() => queue.dispose, [queue]);

  const { files, fileRejections, preparing } = snapshot;
  const summary = useMemo(() => summarize(files), [files]);
  const isPending = preparing > 0 || summary.active;

  return {
    files,
    file: files[0] ?? null,
    phase: isPending ? "uploading" : summary.phase,
    progress: summary.progress,
    error: summary.error,
    isPending,
    fileRejections,
    upload: queue.upload,
    cancel: queue.cancel,
    detach: queue.detach,
    reset: queue.reset,
  };
}

type QueueSnapshot = {
  files: readonly UploadFileState[];
  fileRejections: readonly FileRejection[];
  /** Calls still loading the catalog or waiting on `beforeUpload`. */
  preparing: number;
};

/** How one file of a call ended. */
type FileOutcome =
  | { status: "success"; file: File; result: UploadResult }
  | { status: "error"; file: File; error: APIError }
  | { status: "aborted"; file: File };

/** What a call settled before any file entered the queue. */
type Prepared =
  | { status: "ready"; files: File[]; policy: EnginePolicy }
  | { status: "rejected" }
  | { status: "blocked"; files: File[] }
  | { status: "aborted"; files: File[] }
  | { status: "error"; files: File[]; error: APIError };

type EnginePolicy = { multipart: boolean; checksum: boolean };

/** The settings one call uploads with, fixed when the call starts. */
type CallConfig = {
  api: S3Api;
  options: UseFileUploadOptions;
  call: UploadCallOptions;
  policy: EnginePolicy;
};

/** A queued or running file. */
type Task = {
  id: string;
  file: File;
  config: CallConfig;
  controller: AbortController;
  running: boolean;
  resolve: (outcome: FileOutcome) => void;
};

const ACTIVE_PHASES: ReadonlySet<UploadFilePhase> = new Set([
  "queued",
  "preparing",
  "presigning",
  "uploading",
  "finalizing",
]);

function createUploadQueue(
  initialOptions: UseFileUploadOptions,
  initialContextApi: S3Api | null,
) {
  const listeners = new Set<() => void>();
  const tasks = new Map<string, Task>();
  const waiting: Task[] = [];
  const preparingCalls = new Set<AbortController>();
  let running = 0;
  // The newest render's options and provider API. Each call snapshots its own
  // config; callbacks always read the newest.
  let latest = { options: initialOptions, contextApi: initialContextApi };
  let snapshot: QueueSnapshot = {
    files: [],
    fileRejections: [],
    preparing: 0,
  };

  function commit(patch: Partial<QueueSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function patchFile(id: string, patch: Partial<UploadFileState>) {
    if (!snapshot.files.some((entry) => entry.id === id)) return;
    commit({
      files: snapshot.files.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    });
  }

  function removeFiles(shouldRemove: (entry: UploadFileState) => boolean) {
    const kept: UploadFileState[] = [];
    for (const entry of snapshot.files) {
      if (shouldRemove(entry)) revokePreviewUrl(entry.previewUrl);
      else kept.push(entry);
    }
    if (kept.length !== snapshot.files.length) commit({ files: kept });
  }

  function abortTask(task: Task, reason: DOMException) {
    if (task.running) {
      task.controller.abort(reason);
      return;
    }
    waiting.splice(waiting.indexOf(task), 1);
    tasks.delete(task.id);
    removeFiles((entry) => entry.id === task.id);
    task.resolve({ status: "aborted", file: task.file });
  }

  function abortAll(reason: DOMException) {
    for (const controller of preparingCalls) controller.abort(reason);
    for (const task of tasks.values()) abortTask(task, reason);
  }

  function schedule(entry: UploadFileState, config: CallConfig) {
    const { promise, resolve } = Promise.withResolvers<FileOutcome>();
    const task: Task = {
      id: entry.id,
      file: entry.file,
      config,
      controller: new AbortController(),
      running: false,
      resolve,
    };
    tasks.set(task.id, task);
    waiting.push(task);
    pump();
    return promise;
  }

  function pump() {
    const limit = Math.max(
      1,
      latest.options.concurrentFiles ?? DEFAULT_CONCURRENT_FILES,
    );
    while (running < limit && waiting.length > 0) {
      const task = waiting.shift();
      if (task) void run(task);
    }
  }

  async function run(task: Task) {
    running += 1;
    task.running = true;
    const outcome = await execute(task);
    running -= 1;
    tasks.delete(task.id);
    if (outcome.status === "success") {
      patchFile(task.id, {
        phase: "success",
        result: outcome.result,
        progress: transferProgress(task.file.size, task.file.size),
      });
    } else if (outcome.status === "error") {
      patchFile(task.id, { phase: "error", error: outcome.error });
    } else {
      removeFiles((entry) => entry.id === task.id);
    }
    pump();
    task.resolve(outcome);
  }

  async function execute(task: Task): Promise<FileOutcome> {
    const { id, file, config } = task;
    const { options, call, api, policy } = config;
    const { signal } = task.controller;
    const speed = createThrottledSpeedUpdater(createSpeedTracker());

    let request: UploadRequestOptions;
    try {
      request = resolveRequest(options.uploadOptions, call.uploadOptions, file);
    } catch (error) {
      return {
        status: "error",
        file,
        error: hookFailed("uploadOptions", error),
      };
    }

    // Engine callbacks stop once the file is cancelled or detached.
    try {
      const result = await uploadFile(api, file, {
        route: options.route,
        policy,
        concurrentParts: options.concurrentParts,
        retry: options.retry,
        uploadStore: options.uploadStore,
        request,
        signal,
        onPhaseChange: (phase) => {
          if (!signal.aborted) patchFile(id, { phase });
        },
        onProgress: (raw) => {
          if (signal.aborted) return;
          const progress = speed.apply(raw);
          patchFile(id, { progress });
          notify(latest.options.onProgress, progress, file);
        },
        onPartUpload: (part) => {
          if (!signal.aborted) notify(latest.options.onPartUpload, part, file);
        },
        onMultipartInit: (session) => {
          if (!signal.aborted) {
            notify(latest.options.onMultipartInit, session, file);
          }
        },
      });
      return { status: "success", file, result };
    } catch (error) {
      if (signal.aborted) return { status: "aborted", file };
      return { status: "error", file, error: toClientError(error) };
    }
  }

  /** Loads the policy, validates `files` and runs the call's start callbacks. */
  async function prepare(
    api: S3Api,
    files: File[],
    options: UseFileUploadOptions,
    call: UploadCallOptions,
    signal: AbortSignal,
  ): Promise<Prepared> {
    let pending = files;
    try {
      let catalog: RouteCatalogResponse;
      try {
        catalog = await abortable(loadRouteCatalog(api), signal);
      } catch (error) {
        if (signal.aborted) throw error;
        commit({ fileRejections: [] });
        return { status: "error", files, error: toClientError(error) };
      }

      const policy = mergeRouteUploadPolicy(
        resolveRouteUploadPolicy(catalog, options.route),
        {
          accept: options.accept,
          maxFileSize: options.maxFileSize,
          multipart: options.multipart,
        },
      );
      const maxFiles = Math.min(
        options.maxFiles ?? DEFAULT_MAX_FILES,
        call.maxFiles ?? Number.POSITIVE_INFINITY,
      );
      const accepted: File[] = [];
      const rejected: FileRejection[] = [];
      for (const file of files) {
        const error =
          validateFile(file, policy) ??
          (accepted.length < maxFiles
            ? null
            : s3Error("TOO_MANY_FILES", { maxFiles }));
        if (error) rejected.push({ file, errors: [error] });
        else accepted.push(file);
      }
      commit({ fileRejections: rejected });
      if (rejected.length > 0) notify(latest.options.onFileReject, rejected);
      if (accepted.length === 0) return { status: "rejected" };
      pending = accepted;

      const before = await abortable(
        runBeforeCallback(
          "beforeUpload",
          latest.options.beforeUpload,
          accepted,
        ),
        signal,
      );
      if (before.status === "blocked") {
        return { status: "blocked", files: accepted };
      }
      const error =
        before.status === "error"
          ? before.error
          : runStartCallback(
              "onUploadStart",
              latest.options.onUploadStart,
              accepted,
            );
      if (error) return { status: "error", files: accepted, error };
      return {
        status: "ready",
        files: accepted,
        policy: { multipart: policy.multipart, checksum: policy.checksum },
      };
    } catch (error) {
      if (signal.aborted) return { status: "aborted", files: pending };
      throw error;
    }
  }

  /**
   * Adds entries. A call that starts uploading (`replace`) replaces the queue
   * unless `options.queue` is set; a failed call only appends its rows.
   */
  function enqueue(
    entries: UploadFileState[],
    options: UseFileUploadOptions,
    replace: boolean,
  ) {
    if (replace && !options.queue) {
      for (const task of tasks.values()) {
        abortTask(task, uploadAbortReason("cancel"));
      }
      removeFiles(() => true);
    }
    commit({ files: [...snapshot.files, ...entries] });
  }

  async function upload(
    input: readonly File[],
    call: UploadCallOptions = {},
  ): Promise<UploadBatchResult> {
    const { options } = latest;
    const api = requireApi(options.api ?? latest.contextApi, "useUpload");
    const files = [...input];
    if (files.length === 0) return settle(batchResult([]));

    const controller = new AbortController();
    if (!options.queue) {
      // This call replaces the queue, so an older call still preparing must
      // not enqueue over it once it finishes.
      const reason = uploadAbortReason("cancel");
      for (const pending of preparingCalls) pending.abort(reason);
    }
    preparingCalls.add(controller);
    commit({ preparing: snapshot.preparing + 1 });
    let prepared: Prepared;
    try {
      prepared = await prepare(api, files, options, call, controller.signal);
    } finally {
      preparingCalls.delete(controller);
      commit({ preparing: snapshot.preparing - 1 });
    }

    let outcomes: FileOutcome[];
    switch (prepared.status) {
      case "rejected":
        return settle(batchResult([]));
      case "blocked":
        return settle(batchResult([], prepared.files));
      case "aborted":
        return settle(
          batchResult(
            prepared.files.map((file) => ({ status: "aborted", file })),
          ),
        );
      case "error": {
        const { error } = prepared;
        enqueue(
          prepared.files.map((file) => ({
            ...createEntry(file),
            phase: "error",
            error,
          })),
          options,
          false,
        );
        outcomes = [];
        for (const file of prepared.files) {
          await runAfterCallback(latest.options.onError, error, file);
          outcomes.push({ status: "error", file, error });
        }
        break;
      }
      case "ready": {
        const entries = prepared.files.map(createEntry);
        enqueue(entries, options, true);
        const config: CallConfig = {
          api,
          options,
          call,
          policy: prepared.policy,
        };
        // Each file shows its own result as soon as it ends; the callbacks
        // wait for the whole call, so every error is reported first.
        outcomes = await Promise.all(
          entries.map((entry) => schedule(entry, config)),
        );
        for (const outcome of outcomes) {
          if (outcome.status === "error") {
            await runAfterCallback(
              latest.options.onError,
              outcome.error,
              outcome.file,
            );
          }
        }
        for (const outcome of outcomes) {
          if (outcome.status === "success") {
            await runAfterCallback(
              latest.options.onSuccess,
              outcome.result,
              outcome.file,
            );
          }
        }
        break;
      }
    }
    return settle(batchResult(outcomes));
  }

  async function settle(result: UploadBatchResult) {
    await runAfterCallback(latest.options.onSettled, result);
    return result;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /** Points callbacks and new calls at the newest render's values. */
  function configure(options: UseFileUploadOptions, contextApi: S3Api | null) {
    latest = { options, contextApi };
  }

  function getSnapshot() {
    return snapshot;
  }

  function cancel(id?: string) {
    const reason = uploadAbortReason("cancel");
    if (id === undefined) {
      abortAll(reason);
      return;
    }
    const task = tasks.get(id);
    if (task) abortTask(task, reason);
  }

  function detach() {
    abortAll(uploadAbortReason("detach"));
  }

  function reset() {
    removeFiles((entry) => !ACTIVE_PHASES.has(entry.phase));
    if (snapshot.fileRejections.length > 0) commit({ fileRejections: [] });
  }

  /**
   * On unmount: detaches the files whose call has an `uploadStore`, so they
   * can resume, and cancels the rest.
   */
  function dispose() {
    const cancelReason = uploadAbortReason("cancel");
    const detachReason = uploadAbortReason("detach");
    for (const controller of preparingCalls) controller.abort(cancelReason);
    for (const task of tasks.values()) {
      const resumable = task.config.options.uploadStore != null;
      abortTask(task, resumable ? detachReason : cancelReason);
    }
    removeFiles(() => true);
  }

  return {
    subscribe,
    getSnapshot,
    configure,
    upload,
    cancel,
    detach,
    reset,
    dispose,
  };
}

function createEntry(file: File): UploadFileState {
  return {
    id: crypto.randomUUID(),
    file,
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type,
    previewUrl: createImagePreviewUrl(file),
    phase: "queued",
    progress: transferProgress(0, file.size),
    error: null,
    result: null,
  };
}

/**
 * Request options for `file`: the call's fields win over the hook's, and
 * `metadata` merges key by key.
 */
function resolveRequest(
  hook: UploadRequestInput | undefined,
  call: UploadRequestInput | undefined,
  file: File,
): UploadRequestOptions {
  const base = typeof hook === "function" ? hook(file) : hook;
  const override = typeof call === "function" ? call(file) : call;
  if (!base || !override) return override ?? base ?? {};
  const merged = { ...base, ...override };
  if (base.metadata && override.metadata) {
    merged.metadata = { ...base.metadata, ...override.metadata };
  }
  return merged;
}

function batchResult(
  outcomes: readonly FileOutcome[],
  blocked: File[] = [],
): UploadBatchResult {
  const result: UploadBatchResult = {
    uploaded: [],
    failed: [],
    blocked,
    aborted: [],
  };
  for (const outcome of outcomes) {
    if (outcome.status === "success") {
      result.uploaded.push({ file: outcome.file, result: outcome.result });
    } else if (outcome.status === "error") {
      result.failed.push({ file: outcome.file, error: outcome.error });
    } else {
      result.aborted.push(outcome.file);
    }
  }
  return result;
}

/** The queue phase, byte progress and error, derived from its files. */
function summarize(files: readonly UploadFileState[]) {
  let loaded = 0;
  let total = 0;
  let speed: number | undefined;
  let active = false;
  const failed: APIError[] = [];
  for (const entry of files) {
    loaded += entry.progress.loaded;
    total += entry.progress.total;
    if (ACTIVE_PHASES.has(entry.phase)) {
      active = true;
      if (entry.progress.speed !== undefined) {
        speed = (speed ?? 0) + entry.progress.speed;
      }
    }
    if (entry.error) failed.push(entry.error);
  }

  const progress = transferProgress(loaded, total);
  const phase: UploadPhase =
    files.length === 0 ? "idle" : failed.length > 0 ? "error" : "success";
  const error =
    failed.length === 0
      ? null
      : failed.length === 1
        ? failed[0]
        : s3Error("PARTIAL_FAILURE", {
            failed: failed.length,
            total: files.length,
          });
  return {
    active,
    phase,
    progress: speed === undefined ? progress : { ...progress, speed },
    error,
  };
}
