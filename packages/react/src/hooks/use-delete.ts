"use client";

import { useCallback, useContext, useRef } from "react";
import type { DimahS3Error, S3Api, S3RouteName } from "@dimah-s3/core";
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
  /** Last error, or `null`. */
  error: DimahS3Error | null;
};

export type UseDeleteReturn = UseDeleteState & {
  /** Key awaiting confirmation, or `null`. */
  pendingKey: string | null;
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
  error: DimahS3Error | null;
  pendingKey: string | null;
};

const INITIAL_STATE: InternalState = {
  phase: "idle",
  error: null,
  pendingKey: null,
};

export function useDelete(options: UseDeleteOptions): UseDeleteReturn {
  const [state, patch, replace] = useImmerState(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const pendingKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const requestDelete = useCallback(
    (key: string) => {
      pendingKeyRef.current = key;
      patch((draft) => {
        draft.phase = "confirming";
        draft.error = null;
        draft.pendingKey = key;
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

      if (opts.beforeDelete) {
        const allowed = await opts.beforeDelete(key);
        if (!allowed) {
          patch((draft) => {
            draft.phase = "error";
            draft.error = hookBlockedError(
              "Delete blocked by beforeDelete hook",
            );
            draft.pendingKey = null;
          });
          opts.onError?.(key, new Error("blocked"), "confirming");
          pendingKeyRef.current = null;
          return;
        }
      }

      inFlightRef.current = true;
      patch((draft) => {
        draft.phase = "deleting";
        draft.error = null;
      });
      opts.onDeleteStart?.(key);

      try {
        await api.delete({ route: opts.route, key });
        pendingKeyRef.current = null;
        patch((draft) => {
          draft.phase = "success";
          draft.error = null;
          draft.pendingKey = null;
        });
        try {
          await opts.onSuccess?.(key);
        } catch (err) {
          opts.onError?.(key, err, "success");
        }
      } catch (err) {
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Delete failed");
        });
        opts.onError?.(key, err, "deleting");
      } finally {
        inFlightRef.current = false;
      }
    },
    [apiRef, optsRef, patch],
  );

  const confirmDelete = useCallback(async () => {
    const key = pendingKeyRef.current;
    if (!key) return;
    await executeDelete(key);
  }, [executeDelete]);

  const remove = useCallback(
    async (key: string) => {
      if (inFlightRef.current) return;
      pendingKeyRef.current = key;
      patch((draft) => {
        draft.pendingKey = key;
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

      inFlightRef.current = true;
      patch((draft) => {
        draft.phase = "deleting";
        draft.error = null;
      });

      try {
        const { results } = await api.deleteMany({
          route: opts.route,
          keys,
        });
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
          draft.pendingKey = null;
        });
      } catch (err) {
        patch((draft) => {
          draft.phase = "error";
          draft.error = toHookError(err, "Delete failed");
        });
        opts.onError?.(keys[0] ?? "", err, "deleting");
      } finally {
        inFlightRef.current = false;
      }
    },
    [apiRef, optsRef, patch],
  );

  const cancelDelete = useCallback(() => {
    pendingKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  const reset = useCallback(() => {
    pendingKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  const isConfirming = state.phase === "confirming";
  const isDeleting = state.phase === "deleting";

  return {
    phase: state.phase,
    error: state.error,
    pendingKey: state.pendingKey,
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
