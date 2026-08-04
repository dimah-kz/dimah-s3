"use client";

import { useCallback, useContext, useRef, useState } from "react";
import type { S3Api } from "@dimah-s3/core";
import { S3Context } from "../s3-provider";
import type { DeletePhase, DeleteHooks } from "../types";
import { useLiveRef } from "../internal-helpers";

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
  /** Error message, or `null`. */
  error: string | null;
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
  error: string | null;
  pendingKey: string | null;
};

const INITIAL_STATE: InternalState = {
  phase: "idle",
  error: null,
  pendingKey: null,
};

export function useDelete(options: UseDeleteOptions): UseDeleteReturn {
  const [state, setState] = useState<InternalState>(INITIAL_STATE);
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const pendingKeyRef = useRef<string | null>(null);

  const requestDelete = useCallback((key: string) => {
    pendingKeyRef.current = key;
    setState({ phase: "confirming", error: null, pendingKey: key });
  }, []);

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
        setState({
          phase: "error",
          error: "Delete blocked by beforeDelete hook",
          pendingKey: null,
        });
        opts.onError?.(key, new Error("blocked"), "confirming");
        pendingKeyRef.current = null;
        return;
      }
    }

    setState((s) => ({ ...s, phase: "deleting", error: null }));
    opts.onDeleteStart?.(key);

    try {
      await api.delete(key, { bucket: opts.bucket });
      pendingKeyRef.current = null;
      setState({ phase: "success", error: null, pendingKey: null });
      await opts.onSuccess?.(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setState((s) => ({ ...s, phase: "error", error: message }));
      opts.onError?.(key, err, "deleting");
    }
  }, [apiRef, optsRef]);

  const cancelDelete = useCallback(() => {
    pendingKeyRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const reset = useCallback(() => {
    pendingKeyRef.current = null;
    setState(INITIAL_STATE);
  }, []);

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
