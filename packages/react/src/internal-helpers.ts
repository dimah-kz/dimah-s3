import { useLayoutEffect, useRef } from "react";

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
