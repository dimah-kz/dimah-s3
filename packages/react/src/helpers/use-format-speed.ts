"use client";

import { useCallback } from "react";
import { useTranslations } from "@fuma-translate/react";
import { useFormatFileSize } from "./format-number";

/**
 * Transfer speed formatter for the `S3Provider` `locale`, such as
 * `"1.2 MB/s"`. Digits and unit labels follow {@link useFormatFileSize}.
 *
 * @example
 * ```tsx
 * const formatSpeed = useFormatSpeed();
 * const speed = file.progress.speed ? formatSpeed(file.progress.speed) : null;
 * ```
 */
export function useFormatSpeed(): (bytesPerSecond: number) => string {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();

  return useCallback(
    (bytesPerSecond) =>
      t("{size}/s", {
        note: "transfer speed",
        variables: { size: formatFileSize(bytesPerSecond) },
      }),
    [t, formatFileSize],
  );
}
