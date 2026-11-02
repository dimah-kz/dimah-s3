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
import { mergeUploadRequest, resolveUploadRequest } from "@/upload/request";
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
  /** Uploads the failed file `id` again, or every failed file. */
  retry: (id?: string) => Promise<UploadBatchResult>;
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
 * A failed file can be retried in place. Unmounting detaches the files whose
 * call had an `uploadStore`, so they can resume, and cancels the rest.
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
    retry: queue.retry,
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
  /** The call options each entry was added with, which `retry` sends again. */
  const entryCalls = new Map<string, UploadCallOptions>();
  /** Entries a retry put back in the queue, by id, while its call prepares. */
  const retrying = new Map<string, AbortController>();
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

  function hasFile(id: string) {
    return snapshot.files.some((entry) => entry.id === id);
  }

  function patchFile(id: string, patch: Partial<UploadFileState>) {
    if (!hasFile(id)) return;
    commit({
      files: snapshot.files.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    });
  }

  /** Replaces the entries `replace` returns a value for, in place. */
  function replaceFiles(
    replace: (entry: UploadFileState) => UploadFileState | undefined,
  ) {
    let changed = false;
    const files = snapshot.files.map((entry) => {
      const next = replace(entry) ?? entry;
      if (next !== entry) changed = true;
      return next;
    });
    if (changed) commit({ files });
  }

  function removeFiles(shouldRemove: (entry: UploadFileState) => boolean) {
    const kept: UploadFileState[] = [];
    for (const entry of snapshot.files) {
      if (shouldRemove(entry)) {
        revokePreviewUrl(entry.previewUrl);
        entryCalls.delete(entry.id);
      } else {
        kept.push(entry);
      }
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
      request = mergeUploadRequest(
        resolveUploadRequest(options.uploadOptions, file),
        resolveUploadRequest(call.uploadOptions, file),
      );
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
    call: UploadCallOptions,
    options: UseFileUploadOptions,
    replace: boolean,
  ) {
    if (replace && !options.queue) {
      for (const task of tasks.values()) {
        abortTask(task, uploadAbortReason("cancel"));
      }
      removeFiles(() => true);
    }
    for (const entry of entries) entryCalls.set(entry.id, call);
    commit({ files: [...snapshot.files, ...entries] });
  }

  function upload(
    input: readonly File[],
    call: UploadCallOptions = {},
  ): Promise<UploadBatchResult> {
    return startCall([...input], call, []);
  }

  function retry(id?: string): Promise<UploadBatchResult> {
    const failed = snapshot.files.filter(
      (entry) =>
        entry.phase === "error" && (id === undefined || entry.id === id),
    );
    if (failed.length === 0) return Promise.resolve(batchResult([]));
    // Each file goes again with the options of the call it came from.
    const calls = Map.groupBy(
      failed,
      (entry) => entryCalls.get(entry.id) ?? {},
    );
    return Promise.all(
      [...calls].map(([call, entries]) =>
        startCall(
          entries.map((entry) => entry.file),
          call,
          entries,
        ),
      ),
    ).then(mergeBatchResults);
  }

  /**
   * Runs one call. `retried` holds the failed entries a retry sends again:
   * they keep their place and id, go back to `queued` while the call
   * prepares, and never replace the queue.
   */
  async function startCall(
    files: File[],
    call: UploadCallOptions,
    retried: readonly UploadFileState[],
  ): Promise<UploadBatchResult> {
    const { options } = latest;
    const api = requireApi(options.api ?? latest.contextApi, "useUpload");
    if (files.length === 0) return settle(batchResult([]));

    const controller = new AbortController();
    if (!options.queue && retried.length === 0) {
      // This call replaces the queue, so an older call still preparing must
      // not enqueue over it once it finishes.
      const reason = uploadAbortReason("cancel");
      for (const pending of preparingCalls) pending.abort(reason);
    }
    const previous = new Map(retried.map((entry) => [entry.id, entry]));
    for (const id of previous.keys()) retrying.set(id, controller);
    replaceFiles((entry) =>
      previous.has(entry.id) ? requeued(entry) : undefined,
    );
    preparingCalls.add(controller);
    commit({ preparing: snapshot.preparing + 1 });
    let prepared: Prepared;
    try {
      prepared = await prepare(api, files, options, call, controller.signal);
    } finally {
      preparingCalls.delete(controller);
      for (const id of previous.keys()) retrying.delete(id);
      commit({ preparing: snapshot.preparing - 1 });
    }

    // A retried file whose entry left the queue meanwhile (cancelled, or
    // replaced by a new call) counts as aborted.
    const unclaimed = retried.filter((entry) => hasFile(entry.id));
    const entryOf = (file: File) => {
      const index = unclaimed.findIndex((entry) => entry.file === file);
      return index < 0 ? null : unclaimed.splice(index, 1)[0];
    };
    /** Drops the retried entries the call did not keep, such as rejected ones. */
    const dropRetried = (kept: ReadonlySet<string> = new Set()) => {
      removeFiles((entry) => previous.has(entry.id) && !kept.has(entry.id));
    };

    let outcomes: FileOutcome[];
    switch (prepared.status) {
      case "rejected":
        dropRetried();
        return settle(batchResult([]));
      case "blocked": {
        // A blocked retry leaves each file as it failed.
        const restored = new Set<string>();
        for (const file of prepared.files) {
          const entry = entryOf(file);
          if (entry) restored.add(entry.id);
        }
        replaceFiles((entry) =>
          restored.has(entry.id) ? previous.get(entry.id) : undefined,
        );
        dropRetried(restored);
        return settle(batchResult([], prepared.files));
      }
      case "aborted":
        dropRetried();
        return settle(
          batchResult(
            prepared.files.map((file) => ({ status: "aborted", file })),
          ),
        );
      case "error": {
        const { error } = prepared;
        outcomes = [];
        if (retried.length === 0) {
          enqueue(
            prepared.files.map((file) => ({
              ...createEntry(file),
              phase: "error",
              error,
            })),
            call,
            options,
            false,
          );
          outcomes = prepared.files.map((file) => ({
            status: "error",
            file,
            error,
          }));
        } else {
          const failed = new Set<string>();
          for (const file of prepared.files) {
            const entry = entryOf(file);
            if (entry) failed.add(entry.id);
            outcomes.push(
              entry
                ? { status: "error", file, error }
                : { status: "aborted", file },
            );
          }
          replaceFiles((entry) =>
            failed.has(entry.id)
              ? { ...entry, phase: "error", error }
              : undefined,
          );
          dropRetried(failed);
        }
        for (const outcome of outcomes) {
          if (outcome.status === "error") {
            await runAfterCallback(latest.options.onError, error, outcome.file);
          }
        }
        break;
      }
      case "ready": {
        const config: CallConfig = {
          api,
          options,
          call,
          policy: prepared.policy,
        };
        let scheduled: Promise<FileOutcome>[];
        if (retried.length === 0) {
          const entries = prepared.files.map(createEntry);
          enqueue(entries, call, options, true);
          scheduled = entries.map((entry) => schedule(entry, config));
        } else {
          const kept = new Set<string>();
          scheduled = prepared.files.map((file) => {
            const entry = entryOf(file);
            if (!entry) {
              return Promise.resolve<FileOutcome>({ status: "aborted", file });
            }
            kept.add(entry.id);
            return schedule(entry, config);
          });
          // Files the policy now rejects show in `fileRejections` instead.
          dropRetried(kept);
        }
        // Each file shows its own result as soon as it ends; the callbacks
        // wait for the whole call, so every error is reported first.
        outcomes = await Promise.all(scheduled);
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
    if (task) {
      abortTask(task, reason);
      return;
    }
    // A retry still preparing: the file leaves the queue, and the call stops
    // once it has no file left.
    const controller = retrying.get(id);
    if (!controller) return;
    retrying.delete(id);
    removeFiles((entry) => entry.id === id);
    if (![...retrying.values()].includes(controller)) controller.abort(reason);
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
    retry,
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

/** A failed entry back at the start, keeping its id and preview. */
function requeued(entry: UploadFileState): UploadFileState {
  return {
    ...entry,
    phase: "queued",
    progress: transferProgress(0, entry.file.size),
    error: null,
    result: null,
  };
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

function mergeBatchResults(
  results: readonly UploadBatchResult[],
): UploadBatchResult {
  return {
    uploaded: results.flatMap((result) => result.uploaded),
    failed: results.flatMap((result) => result.failed),
    blocked: results.flatMap((result) => result.blocked),
    aborted: results.flatMap((result) => result.aborted),
  };
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
