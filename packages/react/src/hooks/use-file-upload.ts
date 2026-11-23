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
  isAPIError,
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
import { concurrencyLimit } from "@/internal/pool";
import { freeUploadSlots, reserveUploadSlots } from "@/internal/upload-limits";
import { createMemoryUploadStore } from "@/store/memory-store";
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
import type { UploadStore } from "@/types/upload-store";
import { getUploadAbortKind, uploadAbortReason } from "@/upload/abort";
import {
  DEFAULT_CONCURRENT_FILES,
  DEFAULT_MAX_FILES,
} from "@/upload/constants";
import { discardStoredUpload } from "@/upload/multipart";
import { transferProgress } from "@/upload/progress";
import { mergeUploadRequest, resolveUploadRequest } from "@/upload/request";
import { multipartResumeKey } from "@/upload/resume-key";
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
  /** Uploads the failed files `ids` again, or every failed file. */
  retry: (ids?: string | readonly string[]) => Promise<UploadBatchResult>;
  /** Pauses the files `ids`, or every file and preparing call. */
  pause: (ids?: string | readonly string[]) => void;
  /** Resumes the paused files `ids`, or every paused file. */
  resume: (ids?: string | readonly string[]) => void;
  /** Cancels the files `ids`, or every file and preparing call. */
  cancel: (ids?: string | readonly string[]) => void;
  /** Stops every file but keeps stored multipart uploads for resuming. */
  detach: () => void;
  /**
   * Removes the settled files `ids`, or every settled file and the
   * rejections. Running files keep going.
   */
  reset: (ids?: string | readonly string[]) => void;
};

/**
 * @internal The upload queue behind `useUpload`.
 *
 * Every call loads the route catalog, validates its files, then runs
 * `beforeUpload` and `onUploadStart` once. Valid files share one pool of
 * `concurrentFiles` uploads across calls. Each file can be cancelled on its
 * own. A cancelled or detached file leaves the queue and counts as `aborted`.
 * A failed file can be retried in place. A paused file stays in the queue,
 * and its call waits for it. Multipart uploads resume from the parts S3
 * already has: through the call's `uploadStore`, else through a store the
 * queue keeps for the page session. Unmounting detaches the files whose
 * call had an `uploadStore`, so they can resume, and cancels the rest.
 *
 * The limits `useUploadLimit` sets for `instanceId` cap every call: a call
 * holds its slots from the moment it starts, and a retry takes only the
 * failed files that fit.
 */
export function useFileUpload(
  options: UseFileUploadOptions,
  instanceId: string,
): UseFileUploadReturn {
  const contextApi = useContext(S3Context);
  const [queue] = useState(() =>
    createUploadQueue(options, contextApi, instanceId),
  );
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
    pause: queue.pause,
    resume: queue.resume,
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

/**
 * What a call settled before any file entered the queue. `files` are the
 * ones still in the call; `rejected` are the ones validation refused.
 */
type Prepared = { rejected: FileRejection[] } & (
  | { status: "ready"; files: File[]; policy: EnginePolicy }
  | { status: "rejected" }
  | { status: "blocked"; files: File[] }
  | { status: "aborted"; files: File[] }
  | { status: "error"; files: File[]; error: APIError }
);

/** The options of one `upload` call. A retry sends them again under its `id`. */
type EntryCall = { id: number; options: UploadCallOptions };

type EnginePolicy = { multipart: boolean; checksum: boolean };

/** The settings one call uploads with, fixed when the call starts. */
type CallConfig = {
  api: S3Api;
  options: UseFileUploadOptions;
  call: UploadCallOptions;
  policy: EnginePolicy;
};

/** A queued, running or paused file. */
type Task = {
  id: string;
  file: File;
  config: CallConfig;
  /** The current attempt's controller. A resume starts a new one. */
  controller: AbortController;
  state: "waiting" | "running" | "paused";
  /** A running attempt is stopping for a pause. */
  pausing: boolean;
  /** Resume once the attempt that is stopping for a pause has stopped. */
  resumeAfterPause: boolean;
  /** Cancelled while its attempt stopped for a pause, which kept the session. */
  cancelledWhilePausing: boolean;
  /**
   * The request options the first attempt resolved. A resume sends them
   * again, so it finds the same stored session.
   */
  request: UploadRequestOptions | null;
  resolve: (outcome: FileOutcome) => void;
};

const ACTIVE_PHASES: ReadonlySet<UploadFilePhase> = new Set([
  "queued",
  "preparing",
  "presigning",
  "uploading",
  "finalizing",
]);

/** A file this close to its end finishes instead of pausing. */
const PAUSABLE_PHASES: ReadonlySet<UploadFilePhase> = new Set([
  "queued",
  "preparing",
  "presigning",
  "uploading",
]);

function createUploadQueue(
  initialOptions: UseFileUploadOptions,
  initialContextApi: S3Api | null,
  instanceId: string,
) {
  const listeners = new Set<() => void>();
  const tasks = new Map<string, Task>();
  const waiting: Task[] = [];
  const preparingCalls = new Set<AbortController>();
  /** The call each entry was added by, which `retry` sends again. */
  const entryCalls = new Map<string, EntryCall>();
  let callCount = 0;
  /** Entries a retry put back in the queue, by id, while its call prepares. */
  const retrying = new Map<string, AbortController>();
  /** Preparing calls `pause()` reached: their files enter the queue paused. */
  const pausedCalls = new Set<AbortController>();
  /** Retried entries `pause(id)` reached while their call prepares. */
  const pausedEntries = new Set<string>();
  /**
   * Keeps the multipart sessions of calls without an `uploadStore` while
   * their files are paused, so a resume continues within the page session.
   * Every other end discards what it holds.
   */
  const sessionStore = createMemoryUploadStore();
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
        pausedEntries.delete(entry.id);
      } else {
        kept.push(entry);
      }
    }
    if (kept.length !== snapshot.files.length) commit({ files: kept });
  }

  /** The store a task's multipart session lives in. */
  function storeOf(task: Task): UploadStore {
    return task.config.options.uploadStore ?? sessionStore;
  }

  /**
   * Aborts the multipart session a task's earlier attempt kept, and deletes
   * its record. A task that never resolved its request has none.
   */
  function discardSession(task: Task) {
    if (task.request === null) return;
    const { api, options } = task.config;
    void discardStoredUpload(
      api,
      storeOf(task),
      multipartResumeKey(options.route, task.file, task.request),
      task.file.size,
    );
  }

  function abortTask(task: Task, reason: DOMException) {
    const kind = getUploadAbortKind(reason) ?? "cancel";
    if (task.state === "running") {
      // A pause already aborted the attempt as a detach; the end decides.
      if (task.pausing && kind === "cancel") task.cancelledWhilePausing = true;
      task.pausing = false;
      task.resumeAfterPause = false;
      if (!task.controller.signal.aborted) task.controller.abort(reason);
      return;
    }
    if (task.state === "waiting") waiting.splice(waiting.indexOf(task), 1);
    tasks.delete(task.id);
    removeFiles((entry) => entry.id === task.id);
    // A detach keeps a session only in the call's own `uploadStore`.
    if (kind === "cancel" || task.config.options.uploadStore == null) {
      discardSession(task);
    }
    task.resolve({ status: "aborted", file: task.file });
  }

  function abortAll(reason: DOMException) {
    for (const controller of preparingCalls) controller.abort(reason);
    for (const task of tasks.values()) abortTask(task, reason);
  }

  function schedule(
    entry: UploadFileState,
    config: CallConfig,
    paused: boolean,
  ) {
    const { promise, resolve } = Promise.withResolvers<FileOutcome>();
    const task: Task = {
      id: entry.id,
      file: entry.file,
      config,
      controller: new AbortController(),
      state: paused ? "paused" : "waiting",
      pausing: false,
      resumeAfterPause: false,
      cancelledWhilePausing: false,
      request: null,
      resolve,
    };
    tasks.set(task.id, task);
    if (paused) patchFile(task.id, { phase: "paused" });
    else waiting.push(task);
    pump();
    return promise;
  }

  function pump() {
    const limit = concurrencyLimit(
      latest.options.concurrentFiles,
      DEFAULT_CONCURRENT_FILES,
    );
    while (running < limit && waiting.length > 0) {
      const task = waiting.shift();
      if (task) void run(task);
    }
  }

  async function run(task: Task) {
    running += 1;
    task.state = "running";
    const outcome = await execute(task);
    running -= 1;
    if (outcome.status === "aborted" && task.pausing) {
      // The attempt stopped for a pause: the file waits in the queue.
      task.pausing = false;
      task.controller = new AbortController();
      if (task.resumeAfterPause) {
        task.resumeAfterPause = false;
        task.state = "waiting";
        waiting.push(task);
        patchFile(task.id, { phase: "queued" });
      } else {
        task.state = "paused";
      }
      pump();
      return;
    }
    tasks.delete(task.id);
    // A detach or a failure keeps a session only in the call's own
    // `uploadStore`; a cancel during a pause keeps none.
    if (
      outcome.status !== "success" &&
      (task.cancelledWhilePausing || task.config.options.uploadStore == null)
    ) {
      discardSession(task);
    }
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

    let request = task.request;
    if (request === null) {
      try {
        const base = resolveUploadRequest(options.uploadOptions, file);
        const own = resolveUploadRequest(call.uploadOptions, file);
        // Options that take a moment, such as a folder to create first.
        if (isPromise(base) || isPromise(own)) {
          patchFile(id, { phase: "preparing" });
          const [resolvedBase, resolvedOwn] = await abortable(
            Promise.all([base, own]),
            signal,
          );
          request = mergeUploadRequest(resolvedBase, resolvedOwn);
        } else {
          request = mergeUploadRequest(base, own);
        }
      } catch (error) {
        if (signal.aborted) return { status: "aborted", file };
        return {
          status: "error",
          file,
          error: isAPIError(error) ? error : hookFailed("uploadOptions", error),
        };
      }
      task.request = request;
    }

    // Engine callbacks stop once the file is cancelled or detached.
    try {
      const result = await uploadFile(api, file, {
        route: options.route,
        policy,
        concurrentParts: options.concurrentParts,
        retry: options.retry,
        uploadStore: storeOf(task),
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

  /**
   * Loads the policy, validates `files`, accepts at most `maxFiles` of them
   * and runs the call's start callbacks.
   */
  async function prepare(
    api: S3Api,
    files: File[],
    maxFiles: number,
    options: UseFileUploadOptions,
    signal: AbortSignal,
  ): Promise<Prepared> {
    let pending = files;
    const rejected: FileRejection[] = [];
    try {
      let catalog: RouteCatalogResponse;
      try {
        catalog = await abortable(loadRouteCatalog(api), signal);
      } catch (error) {
        if (signal.aborted) throw error;
        commit({ fileRejections: [] });
        return {
          status: "error",
          files,
          error: toClientError(error),
          rejected,
        };
      }

      const policy = mergeRouteUploadPolicy(
        resolveRouteUploadPolicy(catalog, options.route),
        {
          accept: options.accept,
          maxFileSize: options.maxFileSize,
          multipart: options.multipart,
        },
      );
      const accepted: File[] = [];
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
      if (accepted.length === 0) return { status: "rejected", rejected };
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
        return { status: "blocked", files: accepted, rejected };
      }
      const error =
        before.status === "error"
          ? before.error
          : runStartCallback(
              "onUploadStart",
              latest.options.onUploadStart,
              accepted,
            );
      if (error) return { status: "error", files: accepted, error, rejected };
      return {
        status: "ready",
        files: accepted,
        policy: { multipart: policy.multipart, checksum: policy.checksum },
        rejected,
      };
    } catch (error) {
      if (signal.aborted) {
        return { status: "aborted", files: pending, rejected };
      }
      throw error;
    }
  }

  /**
   * Adds entries. A call that starts uploading (`replace`) replaces the queue
   * unless it appends; a failed call only adds its rows.
   */
  function enqueue(
    entries: UploadFileState[],
    call: EntryCall,
    options: UseFileUploadOptions,
    replace: boolean,
  ) {
    if (replace && !appends(call.options, options)) {
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
    return startCall([...input], { id: ++callCount, options: call }, []);
  }

  function retry(ids?: string | readonly string[]): Promise<UploadBatchResult> {
    const wanted = ids === undefined ? null : new Set(toIds(ids));
    const failed = snapshot.files
      .filter(
        (entry) => entry.phase === "error" && (wanted?.has(entry.id) ?? true),
      )
      // Under a limit, only the failed files that fit go again.
      .slice(0, freeUploadSlots(instanceId, snapshot.files));
    if (failed.length === 0) return Promise.resolve(batchResult([]));
    // Each file goes again with the call it came from. Files are grouped by
    // the call, not by its options object, which two calls may share.
    const calls = new Map<
      number,
      { call: EntryCall; entries: UploadFileState[] }
    >();
    for (const entry of failed) {
      const call = entryCalls.get(entry.id) ?? {
        id: ++callCount,
        options: {},
      };
      const group = calls.get(call.id);
      if (group) group.entries.push(entry);
      else calls.set(call.id, { call, entries: [entry] });
    }
    return Promise.all(
      Array.from(calls.values(), ({ call, entries }) =>
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
   * prepares, and never replace the queue. `retry` already left out the
   * ones past a limit.
   */
  async function startCall(
    files: File[],
    entryCall: EntryCall,
    retried: readonly UploadFileState[],
  ): Promise<UploadBatchResult> {
    const { options } = latest;
    const call = entryCall.options;
    const api = requireApi(options.api ?? latest.contextApi, "useUpload");
    if (files.length === 0) return settle(batchResult([]));

    const controller = new AbortController();
    if (!appends(call, options) && retried.length === 0) {
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
    // A new call holds its slots before it awaits anything, so a call that
    // starts while it prepares sees fewer. Retried entries hold theirs as
    // queued files.
    const maxFiles = Math.min(
      options.maxFiles ?? DEFAULT_MAX_FILES,
      call.maxFiles ?? Number.POSITIVE_INFINITY,
      retried.length === 0
        ? freeUploadSlots(instanceId, snapshot.files)
        : Number.POSITIVE_INFINITY,
    );
    const release = reserveUploadSlots(
      instanceId,
      retried.length === 0 ? Math.min(files.length, maxFiles) : 0,
    );
    let prepared: Prepared;
    let startPaused = false;
    try {
      prepared = await prepare(
        api,
        files,
        maxFiles,
        options,
        controller.signal,
      );
    } finally {
      // The accepted files enter the queue right after, in the same task,
      // and take these slots over.
      release();
      preparingCalls.delete(controller);
      startPaused = pausedCalls.delete(controller);
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

    const { rejected } = prepared;
    let outcomes: FileOutcome[];
    switch (prepared.status) {
      case "rejected":
        dropRetried();
        return settle(batchResult([], { rejected }));
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
        return settle(batchResult([], { rejected, blocked: prepared.files }));
      }
      case "aborted":
        dropRetried();
        return settle(
          batchResult(
            prepared.files.map((file) => ({ status: "aborted", file })),
            { rejected },
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
            entryCall,
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
          enqueue(entries, entryCall, options, true);
          scheduled = entries.map((entry) =>
            schedule(entry, config, startPaused),
          );
        } else {
          const kept = new Set<string>();
          scheduled = prepared.files.map((file) => {
            const entry = entryOf(file);
            if (!entry) {
              return Promise.resolve<FileOutcome>({ status: "aborted", file });
            }
            kept.add(entry.id);
            const paused = pausedEntries.delete(entry.id) || startPaused;
            return schedule(entry, config, paused);
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
    return settle(batchResult(outcomes, { rejected }));
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

  function cancel(ids?: string | readonly string[]) {
    const reason = uploadAbortReason("cancel");
    if (ids === undefined) {
      abortAll(reason);
      return;
    }
    for (const id of toIds(ids)) cancelFile(id, reason);
  }

  function cancelFile(id: string, reason: DOMException) {
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

  function pause(ids?: string | readonly string[]) {
    if (ids === undefined) {
      for (const controller of preparingCalls) pausedCalls.add(controller);
      for (const task of tasks.values()) pauseTask(task);
      return;
    }
    for (const id of toIds(ids)) {
      const task = tasks.get(id);
      if (task) pauseTask(task);
      else if (retrying.has(id)) pausedEntries.add(id);
    }
  }

  function pauseTask(task: Task) {
    if (task.state === "paused" || task.pausing) return;
    const entry = snapshot.files.find(({ id }) => id === task.id);
    if (!entry || !PAUSABLE_PHASES.has(entry.phase)) return;
    if (task.state === "running") {
      // A detach keeps the multipart session; `run` sees the pause.
      task.pausing = true;
      task.controller.abort(uploadAbortReason("detach"));
    } else {
      waiting.splice(waiting.indexOf(task), 1);
      task.state = "paused";
    }
    const { loaded, total } = entry.progress;
    patchFile(task.id, {
      phase: "paused",
      progress: transferProgress(loaded, total),
    });
  }

  function resume(ids?: string | readonly string[]) {
    if (ids === undefined) {
      pausedCalls.clear();
      pausedEntries.clear();
      for (const task of tasks.values()) resumeTask(task);
    } else {
      for (const id of toIds(ids)) {
        const task = tasks.get(id);
        if (task) resumeTask(task);
        else pausedEntries.delete(id);
      }
    }
    pump();
  }

  function resumeTask(task: Task) {
    if (task.pausing) {
      task.resumeAfterPause = true;
      return;
    }
    if (task.state !== "paused") return;
    task.state = "waiting";
    waiting.push(task);
    patchFile(task.id, { phase: "queued" });
  }

  function detach() {
    abortAll(uploadAbortReason("detach"));
  }

  function reset(ids?: string | readonly string[]) {
    const wanted = ids === undefined ? null : new Set(toIds(ids));
    removeFiles(
      (entry) =>
        (entry.phase === "success" || entry.phase === "error") &&
        (wanted?.has(entry.id) ?? true),
    );
    if (wanted === null && snapshot.fileRejections.length > 0) {
      commit({ fileRejections: [] });
    }
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
    pause,
    resume,
    cancel,
    detach,
    reset,
    dispose,
  };
}

/** Whether a call adds to the queue: its own `append`, else the hook's. */
function appends(call: UploadCallOptions, options: UseFileUploadOptions) {
  return call.append ?? options.append ?? false;
}

function toIds(ids: string | readonly string[]): readonly string[] {
  return typeof ids === "string" ? [ids] : ids;
}

/**
 * Ids are a page-wide count, not `crypto.randomUUID()`, which only exists
 * on secure origins (a phone on `http://192.168.…` has none).
 */
let entryCount = 0;

function createEntry(file: File): UploadFileState {
  return {
    id: `upload-${++entryCount}`,
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
  early: { rejected?: FileRejection[]; blocked?: File[] } = {},
): UploadBatchResult {
  const result: UploadBatchResult = {
    uploaded: [],
    failed: [],
    rejected: early.rejected ?? [],
    blocked: early.blocked ?? [],
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
    rejected: results.flatMap((result) => result.rejected),
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
  let paused = false;
  const failed: APIError[] = [];
  for (const entry of files) {
    loaded += entry.progress.loaded;
    total += entry.progress.total;
    if (entry.phase === "paused") paused = true;
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
    files.length === 0
      ? "idle"
      : paused
        ? "paused"
        : failed.length > 0
          ? "error"
          : "success";
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

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof (value as { then?: unknown } | null | undefined)?.then === "function"
  );
}
