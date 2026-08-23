"use client";

import { useCallback, useContext, useRef } from "react";
import type { DimahS3Error, S3Api } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import type { DeletePhase, DeleteHooks } from "../types";
import { hookBlockedError, toHookError } from "../types/error";
import { useLiveRef } from "../internal-helpers";
import { useImmerState } from "../store/use-immer-state";

/** Options for {@link useDelete}. */
export type UseDeleteOptions = DeleteHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Target bucket (overrides server default). */
  bucket?: string;
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
  /** Move to the `confirming` phase for the given key. */
  requestDelete: (key: string) => void;
  /** Send the delete request for the pending key. */
  confirmDelete: () => Promise<void>;
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

  const confirmDelete = useCallback(async () => {
    const key = pendingKeyRef.current;
    if (!key) return;
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
          draft.error = hookBlockedError("Delete blocked by beforeDelete hook");
          draft.pendingKey = null;
        });
        opts.onError?.(key, new Error("blocked"), "confirming");
        pendingKeyRef.current = null;
        return;
      }
    }

    patch((draft) => {
      draft.phase = "deleting";
      draft.error = null;
    });
    opts.onDeleteStart?.(key);

    try {
      await api.delete(key, { bucket: opts.bucket });
      pendingKeyRef.current = null;
      patch((draft) => {
        draft.phase = "success";
        draft.error = null;
        draft.pendingKey = null;
      });
      await opts.onSuccess?.(key);
    } catch (err) {
      patch((draft) => {
        draft.phase = "error";
        draft.error = toHookError(err, "Delete failed");
      });
      opts.onError?.(key, err, "deleting");
    }
  }, [apiRef, optsRef, patch]);

  const cancelDelete = useCallback(() => {
    pendingKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  const reset = useCallback(() => {
    pendingKeyRef.current = null;
    replace(INITIAL_STATE);
  }, [replace]);

  return {
    phase: state.phase,
    error: state.error,
    pendingKey: state.pendingKey,
    requestDelete,
    confirmDelete,
    cancelDelete,
    reset,
  };
}
