"use client";

import { useCallback, useContext } from "react";
import { S3LocaleContext } from "@/s3-provider";
import { toTimestamp, type DateInput } from "./to-timestamp";

/**
 * Date formatter for the `S3Provider` `locale`. Without a `locale`, dates use
 * English so a server render matches the browser. Invalid input returns `""`.
 */
export function useFormatDate(): (
  value: DateInput | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) => string {
  const locale = useContext(S3LocaleContext);

  return useCallback(
    (value, options) => {
      const time = toTimestamp(value);
      if (time == null) return "";
      return dateFormat(locale ?? "en", options).format(time);
    },
    [locale],
  );
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
};
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): Intl.DateTimeFormat {
  const id = `${locale}\0${JSON.stringify(options)}`;
  let format = dateFormats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(id, format);
  }
  return format;
}
