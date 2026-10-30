import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a ref in sync with the latest value after each render.
 *
 * Use inside `useCallback(fn, [ref])` to read the latest prop / option value
 * without making the callback depend on it (stale-closure-free stable refs).
 *
 * @internal — not part of the public API.
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
 *
 * @internal — not part of the public API.
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
