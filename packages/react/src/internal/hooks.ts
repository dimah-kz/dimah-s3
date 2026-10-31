import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createOperationStore,
  newestOperation,
  type KeyedOperation,
  type OperationStore,
} from "./operations";

/**
 * Keeps a ref in sync with the latest value after each render.
 *
 * Use inside `useCallback(fn, [ref])` to read the latest prop / option value
 * without making the callback depend on it (stale-closure-free stable refs).
 */
export function useLiveRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Controlled when `value` is not `undefined`, otherwise local state.
 * The setter calls `onChange` only when the value changes (`isEqual`).
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T | (() => T),
  onChange: ((value: T) => void) | undefined,
  isEqual: (a: T, b: T) => boolean = Object.is,
): [T, (next: T) => void] {
  const [local, setLocal] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : local;
  const currentRef = useLiveRef(current);
  const controlledRef = useLiveRef(controlled);
  const onChangeRef = useLiveRef(onChange);
  const isEqualRef = useLiveRef(isEqual);

  const set = useCallback(
    (next: T) => {
      if (isEqualRef.current(currentRef.current, next)) return;
      currentRef.current = next;
      if (!controlledRef.current) setLocal(() => next);
      onChangeRef.current?.(next);
    },
    [controlledRef, currentRef, isEqualRef, onChangeRef],
  );

  return [current, set];
}

/** State and store returned by {@link useOperationStore}. */
export type UseOperationStoreReturn<TOp extends KeyedOperation, TOutcome> = {
  /** Stable for the life of the component. Start, join and cancel calls here. */
  store: OperationStore<TOp, TOutcome>;
  /** Operations in creation order, as of this render. */
  operations: readonly TOp[];
  /** Keys with a running call, as of this render. */
  pendingKeys: readonly string[];
  /** The newest operation for `key`, as of this render. */
  get: (key: string) => TOp | undefined;
};

/** A per-component {@link OperationStore}, re-rendering on every change. */
export function useOperationStore<
  TOp extends KeyedOperation,
  TOutcome,
>(): UseOperationStoreReturn<TOp, TOutcome> {
  const [store] = useState(() => createOperationStore<TOp, TOutcome>());
  const { operations, pendingKeys } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const get = useCallback(
    (key: string) => newestOperation(operations, key),
    [operations],
  );
  return { store, operations, pendingKeys, get };
}
