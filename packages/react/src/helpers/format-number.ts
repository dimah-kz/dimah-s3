"use client";

import { useCallback, useContext, useMemo } from "react";
import { formatFileSize, type FileSizeUnit } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { S3LocaleContext } from "@/s3-provider";

/**
 * Byte formatter for the `S3Provider` `locale`: native digits and
 * translated unit labels (`"B(file size unit)"`, `"MB(file size unit)"`, …).
 * Without a `locale`, sizes read `12.4 MB`.
 */
export function useFormatFileSize(): (bytes: number) => string {
  const locale = useContext(S3LocaleContext);
  const t = useTranslations();

  return useMemo(() => {
    const units: Record<FileSizeUnit, string> = {
      B: t("B", { note: "file size unit" }),
      KB: t("KB", { note: "file size unit" }),
      MB: t("MB", { note: "file size unit" }),
      GB: t("GB", { note: "file size unit" }),
      TB: t("TB", { note: "file size unit" }),
      PB: t("PB", { note: "file size unit" }),
      EB: t("EB", { note: "file size unit" }),
    };
    return (bytes: number) => formatFileSize(bytes, { locale, units });
  }, [locale, t]);
}

/**
 * Count formatter for the `S3Provider` `locale`, such as `۱۲` for `fa`.
 * Without a `locale`, counts read as plain digits.
 */
export function useFormatNumber(): (value: number) => string {
  const locale = useContext(S3LocaleContext);

  return useCallback(
    (value: number) =>
      locale ? numberFormat(locale).format(value) : String(value),
    [locale],
  );
}

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string): Intl.NumberFormat {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    numberFormats.set(locale, format);
  }
  return format;
}
