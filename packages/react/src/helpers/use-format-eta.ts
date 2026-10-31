"use client";

import { useCallback } from "react";
import { useTranslations } from "@fuma-translate/react";
import type { TransferProgress } from "@/types/operation";
import { useFormatNumber } from "./format-number";

/**
 * Time-left formatter for the `S3Provider` `locale`, such as `"9s left"`,
 * `"4m left"` or `"1h 30m left"`. Returns `null` until the speed is known
 * or when nothing is left to transfer.
 *
 * @example
 * ```tsx
 * const formatEta = useFormatEta();
 * const eta = formatEta(file.progress); // "9s left"
 * ```
 */
export function useFormatEta(): (
  progress: Pick<TransferProgress, "loaded" | "total" | "speed">,
) => string | null {
  const t = useTranslations();
  const formatNumber = useFormatNumber();

  return useCallback(
    ({ loaded, total, speed }) => {
      const remaining = total - loaded;
      if (!speed || speed <= 0 || remaining <= 0) return null;

      const seconds = Math.ceil(remaining / speed);
      if (seconds < 60) {
        return t("{seconds}s left", {
          note: "time remaining",
          variables: { seconds: formatNumber(seconds) },
        });
      }

      const totalMinutes = Math.ceil(seconds / 60);
      if (totalMinutes < 60) {
        return t("{minutes}m left", {
          note: "time remaining",
          variables: { minutes: formatNumber(totalMinutes) },
        });
      }

      const hours = formatNumber(Math.floor(totalMinutes / 60));
      const minutes = totalMinutes % 60;
      if (minutes === 0) {
        return t("{hours}h left", {
          note: "time remaining",
          variables: { hours },
        });
      }
      return t("{hours}h {minutes}m left", {
        note: "time remaining",
        variables: { hours, minutes: formatNumber(minutes) },
      });
    },
    [t, formatNumber],
  );
}
