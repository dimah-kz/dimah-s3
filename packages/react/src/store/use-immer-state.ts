"use client";

import { useCallback, useState } from "react";
import { produce, type Draft } from "immer";

/**
 * Per-hook local state with Immer patches.
 *
 * @internal
 */
export function useImmerState<T extends object>(initialState: T) {
  const [state, setState] = useState(() => structuredClone(initialState));

  const patch = useCallback((recipe: (draft: Draft<T>) => void) => {
    setState(produce(recipe));
  }, []);

  const replace = useCallback((next: T) => {
    setState(structuredClone(next));
  }, []);

  return [state, patch, replace] as const;
}
