"use client";

import { useCallback } from "react";
import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";

function param(
  params: DimahS3Error["params"],
  key: string,
  fallback = "",
): string {
  const value = params?.[key];
  return value === undefined ? fallback : String(value);
}

/**
 * Localized {@link DimahS3Error} → string.
 *
 * `t("…")` call sites are nested under `useTranslations()` so fuma-translate
 * can extract keys (it cannot see `t` passed into a plain helper).
 */
export function useFormatDimahError(): (err: unknown) => string {
  const t = useTranslations();

  return useCallback(
    (err: unknown): string => {
      if (!(err instanceof DimahS3Error) || err.code === undefined) {
        return err instanceof Error
          ? err.message
          : t("Unknown error", { note: "fallback" });
      }

      switch (err.code) {
        case S3_ERROR_CODES.NOT_FOUND:
          return t("Not found", { note: "API error" });
        case S3_ERROR_CODES.INVALID_JSON:
          return t("Invalid request", { note: "API error" });
        case S3_ERROR_CODES.FORBIDDEN:
          return t("Access denied", { note: "API error" });
        case S3_ERROR_CODES.INTERNAL_ERROR:
          return t("Something went wrong", { note: "API error" });
        case S3_ERROR_CODES.OBJECT_NOT_FOUND:
          return t("File not found", { note: "API error" });
        case S3_ERROR_CODES.S3_NETWORK_ERROR:
          return t("Could not reach storage ({code})", {
            note: "API error",
            variables: { code: param(err.params, "code", "UNKNOWN") },
          });
        case S3_ERROR_CODES.FIELD_REQUIRED:
          return t("{name} is required", {
            note: "API error",
            variables: { name: param(err.params, "name") },
          });
        case S3_ERROR_CODES.KEY_REQUIRED:
          return t("Object key is required", { note: "API error" });
        case S3_ERROR_CODES.UPLOAD_ID_REQUIRED:
          return t("Upload ID is required", { note: "API error" });
        case S3_ERROR_CODES.PART_NUMBER_INVALID:
          return t("Part number must be a positive integer", {
            note: "API error",
          });
        case S3_ERROR_CODES.PARTS_REQUIRED:
          return t("At least one upload part is required", {
            note: "API error",
          });
        case S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD:
          return t("File size is required", { note: "upload" });
        case S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART:
          return t("File size is required", { note: "multipart" });
        default:
          return err.message;
      }
    },
    [t],
  );
}
