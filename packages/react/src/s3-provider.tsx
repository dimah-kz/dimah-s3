"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { APIError, S3Api } from "@dimah-s3/core";
import { TranslationProvider } from "@fuma-translate/react";
import type { Translations } from "./translations/types";

/**
 * Internal context — use `S3Provider` to supply and `useS3Api` to consume.
 */
export const S3Context = createContext<S3Api | null>(null);

/** Internal context for the `S3Provider` `locale`. */
export const S3LocaleContext = createContext<string | undefined>(undefined);

/** Your message for an API error, or `undefined` for the built-in one. */
export type S3ErrorFormatter = (error: APIError) => string | undefined;

/** Internal context for the `S3Provider` `formatError`. */
export const S3FormatErrorContext = createContext<S3ErrorFormatter | undefined>(
  undefined,
);

export type S3ProviderProps<TApi extends S3Api = S3Api> = {
  api: TApi;
  /**
   * Optional consumer-owned Fuma locale map (`Partial<Translations>`).
   * Omit for English — source strings in `t("…")` are the default
   * ([Fuma Translate](https://translate.fuma-nama.dev/) key fallback).
   */
  translations?: Partial<Translations>;
  /**
   * BCP 47 locale for sizes and counts in hooks and UI, such as `"fa"`.
   * Unit labels come from `translations` (`"MB(file size unit)"`).
   * Omit for Latin digits.
   */
  locale?: string;
  /**
   * Your message for an API error, used by `useFormatError` and every UI
   * toast before the built-in one. Word a plugin's error codes here, or
   * replace a catalog message. Return `undefined` to keep the built-in
   * message. Define it outside the component, or memoize it, so it keeps
   * its identity across renders.
   */
  formatError?: S3ErrorFormatter;
  children: ReactNode;
};

/** Used when `translations` is omitted, so the provider value stays stable. */
const NO_TRANSLATIONS: Partial<Translations> = {};

/**
 * Provides an `S3Api` (optionally extended with client plugins) to child hooks
 * and UI. Children are always wrapped in a Fuma `TranslationProvider`, so the
 * tree keeps its shape when `translations` changes. Its map extends any
 * `TranslationProvider` above it; without one, English source keys are used.
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
  locale,
  formatError,
  children,
}: S3ProviderProps<TApi>) {
  return (
    <S3Context.Provider value={api}>
      <S3LocaleContext.Provider value={locale}>
        <S3FormatErrorContext.Provider value={formatError}>
          <TranslationProvider translations={translations ?? NO_TRANSLATIONS}>
            {children}
          </TranslationProvider>
        </S3FormatErrorContext.Provider>
      </S3LocaleContext.Provider>
    </S3Context.Provider>
  );
}

/**
 * Returns the API from the nearest `S3Provider`.
 * Pass a generic (e.g. `useS3Api<typeof api>()`) when the client was created
 * with plugins so plugin methods stay typed, or use the bound
 * `s3Client.useApi()` from {@link createS3Client}, which needs none.
 *
 * @throws if no `S3Provider` is found in the tree.
 */
export function useS3Api<TApi extends S3Api = S3Api>(): TApi {
  const ctx = useContext(S3Context);
  if (!ctx) {
    throw new Error(
      "[dimah-s3] No S3Api found. Wrap your app with <S3Provider api={...}>.",
    );
  }
  return ctx as TApi;
}
