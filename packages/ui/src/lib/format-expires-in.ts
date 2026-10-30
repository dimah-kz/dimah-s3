import { useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";

function durationParts(seconds: number): {
  unit: "day" | "hour" | "minute" | "second";
  count: number;
} {
  const safe = Math.max(1, Math.round(seconds));
  if (safe >= 86_400) {
    return { unit: "day", count: Math.max(1, Math.round(safe / 86_400)) };
  }
  if (safe >= 3600) {
    return { unit: "hour", count: Math.max(1, Math.round(safe / 3600)) };
  }
  if (safe >= 60) {
    return { unit: "minute", count: Math.max(1, Math.round(safe / 60)) };
  }
  return { unit: "second", count: safe };
}

/** "Expires in 1 hour" for a signed link. `0` is a proxy link. */
export function useShareExpiryLabel() {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  return (seconds: number) => {
    if (seconds <= 0) {
      return t("This link works while you can access this file.", {
        note: "object list menu",
      });
    }
    const { unit, count } = durationParts(seconds);
    const value = formatNumber(count);
    if (unit === "day") {
      return count === 1
        ? t("Expires in 1 day", { note: "object list menu" })
        : t("Expires in {count} days", {
            note: "object list menu",
            variables: { count: value },
          });
    }
    if (unit === "hour") {
      return count === 1
        ? t("Expires in 1 hour", { note: "object list menu" })
        : t("Expires in {count} hours", {
            note: "object list menu",
            variables: { count: value },
          });
    }
    if (unit === "minute") {
      return count === 1
        ? t("Expires in 1 minute", { note: "object list menu" })
        : t("Expires in {count} minutes", {
            note: "object list menu",
            variables: { count: value },
          });
    }
    return count === 1
      ? t("Expires in 1 second", { note: "object list menu" })
      : t("Expires in {count} seconds", {
          note: "object list menu",
          variables: { count: value },
        });
  };
}
