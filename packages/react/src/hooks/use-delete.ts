"use client";

import { useCallback, useContext, useRef } from "react";
import {
  DELETE_BATCH_MAX_KEYS,
  type APIError,
  type S3Api,
  type S3RouteName,
} from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import type { DeletePhase, DeleteHooks } from "@/types";
import { hookBlockedError, toHookError } from "@/types/error";
import { useLiveRef } from "@/internal-helpers";
import { useImmerState } from "@/store/use-immer-state";

/** Options for {@link useDelete}. */
export type UseDeleteOptions = DeleteHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Named server route (`dimahS3({ routes })`). */
  route: S3RouteName;
};

export type UseDeleteState = {
  /** Current delete phase. */
  phase: DeletePhase;
  /**
   * Object this operation is targeting. Set on `requestDelete` / `remove`;
   * kept through success/error until `reset()` / `cancelDelete()` or the
   * next key. Lets a list of controls share one hook instance.
   */
  objectKey: string | null;
  /** Last error, or `null`. */
  error: APIError | null;
};

export type UseDeleteReturn = UseDeleteState & {
  /** `true` while the confirm dialog should be open (`phase === "confirming"`). */
  isConfirming: boolean;
  /** `true` while the delete request is in flight (`phase === "deleting"`). */
  isDeleting: boolean;
  /** `true` while confirming or deleting. */
  isPending: boolean;
  /** Move to the `confirming` phase for the given key. */
  requestDelete: (key: string) => void;
  /** Send the delete request for the pending key. */
  confirmDelete: () => Promise<void>;
  /** Delete `key` immediately — no confirm step. */
  remove: (key: string) => Promise<void>;
  /** Delete several keys via `api.deleteMany`. */
  removeMany: (keys: string[]) => Promise<void>;
  /** Cancel confirmation and return to `idle`. */
  cancelDelete: () => void;
  /** Reset state to `idle`. */
  reset: () => void;
};

type InternalState = {
  phase: DeletePhase;
  error: APIError | null;
  objectKey: string | null;
};

const INITIAL_STATE: InternalState = {
  phase: "idle",
  error: null,
  objectKey: null,
};

export function useDelete(options: UseDeleteOptions): UseDeleteReturn {
  const [state, patch, replace] = useImmerState(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const objectKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);

  const requestDelete = useCallback(
    (key: string) => {
      if (inFlightRef.current) return;
      objectKeyRef.current = key;
      patch((draft) => {
        draft.phase = "confirming";
        draft.error = null;
        draft.objectKey = key;
      });
    },
    [patch],
  );

  const executeDelete = useCallback(
    async (key: string) => {
      if (inFlightRef.current) return;
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useDelete or wrap with <S3Provider>.",
        );

      const generation = ++generationRef.current;
      inFlightRef.current = true;

      if (opts.beforeDelete) {
        const allowed = await opts.beforeDelete(key);
        if (generation !== generationRef.current) return;
        if (!allowed) {
          inFlightRef.current = false;
          objectKeyRef.current = null;
          patch((draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Delete blocked by beforeDelete hook",
            );
            draft.objectKey = key;
          });
          opts.onError?.(key, new Error("blocked"), "confirming");
          return;
        }
      }

      patch((draft) => {
        draft.phase = "deleting";
        draft.error = null;
        draft.objectKey = key;
      });
      opts.onDeleteStart?.(key);

      try {
        await api.delete({ route: opts.route, key });
        if (generation !== generationRef.current) return;
        objectKeyRef.current = null;
        patch((draft) => {
          draft.phase = "success";
          draft.error = null;
          draft.objectKey = key;
        });
        try {
          await opts.onSuccess?.(key);
        } catch (err) {
          opts.onError?.(key, err, "success");
        }
      } catch (err) {
        if (generation !== generationRef.current) return;
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Delete failed");
          draft.objectKey = key;
        });
        opts.onError?.(key, err, "deleting");
      } finally {
        if (generation === generationRef.current) {
          inFlightRef.current = false;
        }
      }
    },
    [apiRef, optsRef, patch],
  );

  const confirmDelete = useCallback(async () => {
    const key = objectKeyRef.current;
    if (!key) return;
    await executeDelete(key);
  }, [executeDelete]);

  const remove = useCallback(
    async (key: string) => {
      if (inFlightRef.current) return;
      objectKeyRef.current = key;
      patch((draft) => {
        draft.objectKey = key;
        draft.error = null;
      });
      await executeDelete(key);
    },
    [executeDelete, patch],
  );

  const removeMany = useCallback(
    async (keys: string[]) => {
      if (inFlightRef.current || keys.length === 0) return;
      const opts = optsRef.current;
      const api = opts.api ?? apiRef.current;
      if (!api)
        throw new Error(
          "[dimah-s3] No S3Api found. Pass `api` to useDelete or wrap with <S3Provider>.",
        );

      if (keys.length > DELETE_BATCH_MAX_KEYS) {
        throw new Error(
          `[dimah-s3] deleteMany accepts at most ${DELETE_BATCH_MAX_KEYS} keys.`,
        );
      }

      const generation = ++generationRef.current;
      inFlightRef.current = true;
      patch((draft) => {
        draft.phase = "deleting";
        draft.error = null;
        draft.objectKey = null;
      });

      try {
        const { results } = await api.deleteMany({
          route: opts.route,
          keys,
        });
        if (generation !== generationRef.current) return;
        const failed = results.filter((item) => !item.success);
        for (const item of results) {
          if (item.success) {
            try {
              await opts.onSuccess?.(item.key);
            } catch (err) {
              opts.onError?.(item.key, err, "success");
            }
          } else {
            opts.onError?.(
              item.key,
              new Error(item.error?.message ?? "Delete failed"),
              "deleting",
            );
          }
        }
        if (failed.length > 0) {
          patch((draft) => {
            draft.phase = "error";
            draft.error = toHookError(
              new Error(failed[0]?.error?.message ?? "Delete failed"),
              "Delete failed",
            );
          });
          return;
        }
        patch((draft) => {
          draft.phase = "success";
          draft.error = null;
        });
      } catch (err) {
        if (generation !== generationRef.current) return;
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Delete failed");
        });
        opts.onError?.(keys[0] ?? "", err, "deleting");
      } finally {
        if (generation === generationRef.current) {
          inFlightRef.current = false;
        }
      }
    },
    [apiRef, optsRef, patch],
  );

  const cancelDelete = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    objectKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    objectKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  const isConfirming = state.phase === "confirming";
  const isDeleting = state.phase === "deleting";

  return {
    phase: state.phase,
    objectKey: state.objectKey,
    error: state.error,
    isConfirming,
    isDeleting,
    isPending: isConfirming || isDeleting,
    requestDelete,
    confirmDelete,
    remove,
    removeMany,
    cancelDelete,
    reset,
  };
}
