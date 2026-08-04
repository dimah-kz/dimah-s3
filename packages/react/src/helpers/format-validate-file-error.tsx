"use client";

import { useCallback } from "react";
import type { ValidateFileError } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";

/**
 * Localized {@link ValidateFileError} → string.
 *
 * `t("…")` call sites are nested under `useTranslations()` so fuma-translate
 * can extract keys.
 */
export function useFormatValidateFileError(): (
  error: ValidateFileError,
) => string {
  const t = useTranslations();

  return useCallback(
    (error: ValidateFileError): string => {
      switch (error.code) {
        case "FILE_TYPE_NOT_ALLOWED":
          return t('File type "{type}" is not allowed', {
            note: "file validation",
            variables: { type: String(error.params?.type ?? "") },
          });
        case "FILE_EMPTY":
          return t("File is empty", { note: "file validation" });
        case "FILE_TOO_LARGE":
          return t("File size exceeds {size} limit", {
            note: "file validation",
            variables: { size: String(error.params?.size ?? "") },
          });
        default:
          return error.message;
      }
    },
    [t],
  );
}
