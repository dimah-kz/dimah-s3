"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "@fuma-translate/react";
import { formatAcceptLabels } from "./format-accept-labels";

/**
 * Accept-label formatter with translated group labels (`"Images(file type
 * group)"`, …). Extension and MIME labels such as `PNG` stay as they are.
 *
 * @example
 * ```tsx
 * const formatAcceptLabels = useFormatAcceptLabels();
 * formatAcceptLabels(upload.policy.accept).join(", "); // "Images, PDF"
 * ```
 */
export function useFormatAcceptLabels(): (
  accept?: readonly string[],
) => string[] {
  const t = useTranslations();
  const groups = useMemo(
    () => ({
      image: t("Images", { note: "file type group" }),
      video: t("Videos", { note: "file type group" }),
      audio: t("Audio", { note: "file type group" }),
      text: t("Text files", { note: "file type group" }),
      font: t("Fonts", { note: "file type group" }),
    }),
    [t],
  );
  return useCallback(
    (accept?: readonly string[]) => formatAcceptLabels(accept, { groups }),
    [groups],
  );
}
