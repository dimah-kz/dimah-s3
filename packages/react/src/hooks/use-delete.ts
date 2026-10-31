"use client";

import { useCallback, useContext, useId, useRef } from "react";
import {
  APIError,
  DELETE_MANY_MAX_KEYS,
  s3Error,
  type DeleteManyResponse,
  type S3Api,
  type S3RouteName,
} from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import {
  runAfterCallback,
  runBeforeCallback,
  runStartCallback,
} from "@/internal/callbacks";
import { requireApi, toClientError } from "@/internal/client-error";
import { useLiveRef, useOperationStore } from "@/internal/hooks";
import type { OperationClaim } from "@/internal/operations";
import type {
  DeleteOperation,
  DeleteOutcome,
  DeleteResult,
  UseDeleteOptions,
  UseDeleteReturn,
} from "@/types/delete";

type DeleteClaim = OperationClaim<DeleteOperation, DeleteOutcome>;

/** A key this call owns, with the display name for its operation. */
type DeleteTarget = { claim: DeleteClaim; fileName: string | null };

/** Sends the delete request(s) and reports each key's outcome once known. */
type DeleteRequest = (
  report: (outcome: Exclude<DeleteOutcome, { status: "blocked" }>) => void,
) => Promise<void>;

/**
 * Deletes objects by key, with one operation per key. `remove` deletes one
 * key; `removeMany` deletes any number through `deleteMany`. A call for a key
 * that is already running joins it. Confirmation is the UI's job.
 */
export function useDelete(options: UseDeleteOptions): UseDeleteReturn {
  const instanceId = useId();
  const contextApi = useContext(S3Context);
  const optionsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const batchCountRef = useRef(0);
  const { store, operations, pendingKeys, get } = useOperationStore<
    DeleteOperation,
    DeleteOutcome
  >();

  const remove = useCallback<UseDeleteReturn["remove"]>(
    async (key, { fileName } = {}) => {
      const opts = optionsRef.current;
      const api = requireApi(opts.api ?? apiRef.current, "useDelete");
      return store.run(
        key,
        async (claim) => {
          const [outcome] = await runDelete(
            opts,
            [{ claim, fileName: fileName ?? null }],
            null,
            deleteOne(api, opts.route, key),
          );
          return outcome;
        },
        async (outcome) => {
          await reportOutcomes(opts, [outcome]);
          await runAfterCallback(opts.onSettled, toResult([outcome]));
        },
      );
    },
    [apiRef, optionsRef, store],
  );

  const removeMany = useCallback<UseDeleteReturn["removeMany"]>(
    async (items) => {
      const opts = optionsRef.current;
      const api = requireApi(opts.api ?? apiRef.current, "useDelete");

      // Claim free keys before any await so that concurrent calls join them.
      const calls = new Map<string, Promise<DeleteOutcome>>();
      const targets: DeleteTarget[] = [];
      for (const item of items) {
        const { key, fileName } =
          typeof item === "string" ? { key: item } : item;
        if (calls.has(key)) continue;
        const joined = store.join(key);
        if (joined) {
          calls.set(key, joined);
          continue;
        }
        const claim = store.claim(key);
        calls.set(key, claim.promise);
        targets.push({ claim, fileName: fileName ?? null });
      }

      if (targets.length > 0) {
        const outcomes = runDelete(
          opts,
          targets,
          String(++batchCountRef.current),
          deleteMany(
            api,
            opts.route,
            targets.map(({ claim }) => claim.key),
          ),
        );
        // One report for the whole call, once every key it sent is free.
        let reported: Promise<void> | undefined;
        const report = () =>
          (reported ??= outcomes.then((settled) =>
            reportOutcomes(opts, settled),
          ));
        targets.forEach(({ claim }, index) => {
          void claim.settle(
            outcomes.then((settled) => settled[index]),
            report,
          );
        });
      }

      const result = toResult(await Promise.all(calls.values()));
      await runAfterCallback(opts.onSettled, result);
      return result;
    },
    [apiRef, optionsRef, store],
  );

  return {
    instanceId,
    operations,
    get,
    pendingKeys,
    isPending: pendingKeys.length > 0,
    remove,
    removeMany,
    reset: store.reset,
  };
}

/**
 * Runs one call for `targets`: `beforeDelete`, `onDeleteStart`, then the
 * request. Publishes one operation per key unless the call is blocked.
 * Returns the outcomes in `targets` order; the caller runs the
 * after-callbacks once the keys are free.
 */
async function runDelete(
  options: UseDeleteOptions,
  targets: readonly DeleteTarget[],
  batchId: string | null,
  request: DeleteRequest,
): Promise<DeleteOutcome[]> {
  const keys = targets.map(({ claim }) => claim.key);
  const before = await runBeforeCallback(
    "beforeDelete",
    options.beforeDelete,
    keys,
  );
  if (before.status === "blocked") {
    return keys.map((key) => ({ status: "blocked", key }));
  }

  const hookError =
    before.status === "error"
      ? before.error
      : runStartCallback("onDeleteStart", options.onDeleteStart, keys);
  const claims = new Map<string, DeleteClaim>();
  for (const { claim, fileName } of targets) {
    claims.set(claim.key, claim);
    claim.publish({
      batchId,
      fileName,
      phase: hookError ? "error" : "deleting",
      error: hookError,
    });
  }

  const reported = new Map<string, DeleteOutcome>();
  const report = (outcome: DeleteOutcome) => {
    const claim = claims.get(outcome.key);
    if (!claim || reported.has(outcome.key)) return;
    reported.set(outcome.key, outcome);
    claim.update(
      outcome.status === "error"
        ? { phase: "error", error: outcome.error }
        : { phase: "success" },
    );
  };
  if (hookError) {
    for (const key of keys) report({ status: "error", key, error: hookError });
  } else {
    await request(report);
  }

  return keys.map((key) => {
    const outcome = reported.get(key);
    if (outcome) return outcome;
    // The server left the key out of its response.
    const missing: DeleteOutcome = {
      status: "error",
      key,
      error: s3Error("UNKNOWN_ERROR"),
    };
    report(missing);
    return missing;
  });
}

/** Runs `onError` for every failed key, then `onSuccess` for every deleted key. */
async function reportOutcomes(
  options: UseDeleteOptions,
  outcomes: readonly DeleteOutcome[],
): Promise<void> {
  for (const outcome of outcomes) {
    if (outcome.status === "error") {
      await runAfterCallback(options.onError, outcome.error, outcome.key);
    }
  }
  for (const outcome of outcomes) {
    if (outcome.status === "success") {
      await runAfterCallback(options.onSuccess, outcome.data, outcome.key);
    }
  }
}

/** Deletes `key` with `api.delete`. */
function deleteOne(api: S3Api, route: S3RouteName, key: string): DeleteRequest {
  return async (report) => {
    try {
      const data = await api.delete({ route, key });
      report({ status: "success", key, data });
    } catch (error) {
      report({ status: "error", key, error: toClientError(error) });
    }
  };
}

/**
 * Deletes `keys` with `api.deleteMany`, one request per
 * `DELETE_MANY_MAX_KEYS` keys, in sequence. A failed request fails every key
 * it carried; the next request still runs.
 */
function deleteMany(
  api: S3Api,
  route: S3RouteName,
  keys: readonly string[],
): DeleteRequest {
  return async (report) => {
    for (let start = 0; start < keys.length; start += DELETE_MANY_MAX_KEYS) {
      const chunk = keys.slice(start, start + DELETE_MANY_MAX_KEYS);
      let response: DeleteManyResponse;
      try {
        response = await api.deleteMany({ route, keys: chunk });
      } catch (error) {
        const clientError = toClientError(error);
        for (const key of chunk) {
          report({ status: "error", key, error: clientError });
        }
        continue;
      }
      for (const key of response.deleted) {
        report({ status: "success", key, data: { key } });
      }
      for (const { key, error } of response.failed) {
        report({ status: "error", key, error: APIError.fromShape(error) });
      }
    }
  };
}

/** Groups outcomes by status, keeping their order. */
function toResult(outcomes: readonly DeleteOutcome[]): DeleteResult {
  const result: DeleteResult = { deleted: [], failed: [], blocked: [] };
  for (const outcome of outcomes) {
    switch (outcome.status) {
      case "success":
        result.deleted.push(outcome.key);
        break;
      case "error":
        result.failed.push({ key: outcome.key, error: outcome.error });
        break;
      case "blocked":
        result.blocked.push(outcome.key);
        break;
    }
  }
  return result;
}
