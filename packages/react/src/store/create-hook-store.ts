"use client";

import { useState } from "react";
import { produce, type Draft } from "immer";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Per-instance Zustand store API.
 *
 * @internal
 */
export type HookStore<T> = StoreApi<T>;

/**
 * Create a per-instance vanilla Zustand store.
 *
 * @internal — used by stateful hooks; not a public app-wide store.
 */
export function createHookStore<T extends object>(
  initialState: T,
): HookStore<T> {
  return createStore<T>()(() => structuredClone(initialState));
}

/**
 * Lazily create one store per hook instance (survives re-renders).
 *
 * @internal
 */
export function useHookStoreInstance<T extends object>(
  initialState: T,
): HookStore<T> {
  const [store] = useState(() => createHookStore(initialState));
  return store;
}

/**
 * Subscribe to a per-instance store with a selector.
 *
 * @internal
 */
export function useHookStore<T, U>(
  store: HookStore<T>,
  selector: (state: T) => U,
): U {
  return useStore(store, selector);
}

/**
 * Subscribe to multiple store fields with shallow equality.
 * Prefer this over selecting the whole state object so unchanged slices
 * (via Immer structural sharing) skip re-renders.
 *
 * @internal
 */
export function useHookStoreShallow<T extends object, U extends object>(
  store: HookStore<T>,
  selector: (state: T) => U,
): U {
  return useStore(store, useShallow(selector));
}

/**
 * Apply an Immer recipe to the store state.
 *
 * @internal
 */
export function patchHookState<T extends object>(
  store: HookStore<T>,
  recipe: (draft: Draft<T>) => void,
): void {
  store.setState(produce(store.getState(), recipe));
}

/**
 * Replace the entire store state with a fresh clone of `next`.
 * Avoids Immer freeze issues when reusing module-level INITIAL constants.
 *
 * @internal
 */
export function replaceHookState<T extends object>(
  store: HookStore<T>,
  next: T,
): void {
  store.setState(structuredClone(next), true);
}
