"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { S3Api } from "@dimah-s3/core";
import { TranslationProvider } from "@fuma-translate/react";
import type { Translations } from "./translations/types";

/**
 * Internal context — use `S3Provider` to supply and `useApi` to consume.
 */
export const S3Context = createContext<S3Api | null>(null);

export type S3ProviderProps<TApi extends S3Api = S3Api> = {
  api: TApi;
  /**
   * Optional consumer-owned Fuma locale map (`Partial<Translations>`).
   * Omit for English — source strings in `t("…")` are the default
   * ([Fuma Translate](https://translate.fuma-nama.dev/) key fallback).
   */
  translations?: Partial<Translations>;
  children: ReactNode;
};

/**
 * Provides an `S3Api` (optionally extended with client plugins) to child hooks
 * and UI. When `translations` is set, wraps children in Fuma
 * `TranslationProvider`; otherwise English source keys are used as-is.
 *
 * Prefer {@link createS3Client} when using client plugins — it returns the
 * API object itself plus a bound `Provider` / typed `useApi()`.
 *
 * @example
 * ```tsx
 * import { createS3Client, type Translations } from "@dimah-s3/react";
 *
 * const de = {
 *   "Upload failed(toast)": "Upload fehlgeschlagen",
 * } satisfies Partial<Translations>;
 *
 * export const s3Client = createS3Client();
 * export const S3Provider = s3Client.Provider;
 * // <S3Provider translations={de}>{children}</S3Provider>
 * ```
 */
export function S3Provider<TApi extends S3Api>({
  api,
  translations,
  children,
}: S3ProviderProps<TApi>) {
  return (
    <S3Context.Provider value={api}>
      {translations ? (
        <TranslationProvider translations={translations}>
          {children}
        </TranslationProvider>
      ) : (
        children
      )}
    </S3Context.Provider>
  );
}

/**
 * Returns the API from the nearest `S3Provider`.
 * Pass a generic (e.g. `useApi<typeof api>()`) when the client was created
 * with plugins so plugin methods stay typed.
 *
 * @throws if no `S3Provider` is found in the tree.
 */
export function useApi<TApi extends S3Api = S3Api>(): TApi {
  const ctx = useContext(S3Context);
  if (!ctx) {
    throw new Error(
      "[dimah-s3] No S3Api found. " +
        "Either wrap your app with <S3Provider api={...}> or pass `api` directly to the hook.",
    );
  }
  return ctx as TApi;
}
