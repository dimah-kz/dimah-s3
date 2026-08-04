"use client";

import { createS3Client } from "@dimah-s3/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fa } from "@/lib/translations-fa";

export const { api, S3Provider, useApi } = createS3Client();

type LocaleId = "en" | "fa";

type LocaleContextValue = {
  localeId: LocaleId;
  setLocaleId: (id: LocaleId) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Wraps the app with an S3Provider so all dimah-s3 hooks and UI components
 * can access the shared client + optional consumer-owned Fuma translations.
 *
 * English is the default (source keys in `t("…")`). The demo `fa` pack lives
 * in this example app — not in `@dimah-s3/react`.
 */
export function S3ClientProvider({ children }: { children: ReactNode }) {
  const [localeId, setLocaleId] = useState<LocaleId>("en");

  useEffect(() => {
    document.documentElement.lang = localeId === "fa" ? "fa-IR" : "en";
    document.documentElement.dir = localeId === "fa" ? "rtl" : "ltr";
  }, [localeId]);

  const value = useMemo(() => ({ localeId, setLocaleId }), [localeId]);

  return (
    <LocaleContext.Provider value={value}>
      <S3Provider translations={localeId === "fa" ? fa : undefined}>
        {children}
      </S3Provider>
    </LocaleContext.Provider>
  );
}

export function useExampleLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useExampleLocale must be used within S3ClientProvider");
  }
  return ctx;
}

export function LocaleToggle({ className }: { className?: string }) {
  const { localeId, setLocaleId } = useExampleLocale();
  const toggle = useCallback(() => {
    setLocaleId(localeId === "en" ? "fa" : "en");
  }, [localeId, setLocaleId]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        className ??
        "rounded-md border px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }
      aria-label="Toggle locale"
    >
      {localeId === "en" ? "فارسی / RTL" : "English / LTR"}
    </button>
  );
}
