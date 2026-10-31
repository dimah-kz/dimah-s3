"use client";

import { useTranslations } from "@fuma-translate/react";
import {
  useFormatFileSize,
  useFormatNumber,
  type UploadPolicy,
} from "@dimah-s3/react";
import { formatAcceptLabels } from "@dimah-s3/react/engine";

/** The policy fields {@link useUploadHints} describes. */
export type UploadHintsPolicy = Pick<
  UploadPolicy,
  "accept" | "maxFileSize" | "maxFiles"
>;

/** Localized lines that describe what a route accepts. */
export type UploadHints = {
  /** File count and size limits, such as "You can upload 3 files. Each up to 10 MB.". */
  limits: string | null;
  /** Accepted types, such as "Accepted PNG, JPEG.". */
  accept: string | null;
};

/**
 * Hint lines for an upload policy, shown under a dropzone or field.
 * A line is `null` when the policy sets nothing for it.
 */
export function useUploadHints(policy: UploadHintsPolicy): UploadHints {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const { maxFiles, maxFileSize } = policy;

  const limitParts: string[] = [];
  if (maxFiles > 1) {
    limitParts.push(
      t("You can upload {count} files", {
        note: "dropzone hint",
        variables: { count: formatNumber(maxFiles) },
      }),
    );
  }
  if (maxFileSize != null) {
    const size = formatFileSize(maxFileSize);
    limitParts.push(
      maxFiles > 1
        ? t("Each up to {size}", {
            note: "dropzone hint",
            variables: { size },
          })
        : t("Up to {size}", {
            note: "dropzone hint",
            variables: { size },
          }),
    );
  }

  const acceptLabels = formatAcceptLabels(policy.accept);
  return {
    limits: limitParts.length > 0 ? `${limitParts.join(". ")}.` : null,
    accept:
      acceptLabels.length > 0
        ? t("Accepted {types}.", {
            note: "dropzone hint",
            variables: { types: acceptLabels.join(", ") },
          })
        : null,
  };
}
