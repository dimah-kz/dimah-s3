"use client";

import { useCallback } from "react";
import { DimahS3Error, S3_ERROR_CODES, isDimahS3Error } from "@dimah-s3/core";
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
      if (!isDimahS3Error(err) || err.code === undefined) {
        return err instanceof Error
          ? err.message
          : t("Unknown error", { note: "fallback" });
      }

      switch (err.code) {
        case S3_ERROR_CODES.NOT_FOUND.code:
          return t("Not found", { note: "API error" });
        case S3_ERROR_CODES.UNAUTHORIZED.code:
          return t("Unauthorized", { note: "API error" });
        case S3_ERROR_CODES.FORBIDDEN.code:
          return t("Access denied", { note: "API error" });
        case S3_ERROR_CODES.CONFLICT.code:
          return t("Conflict", { note: "API error" });
        case S3_ERROR_CODES.INTERNAL_ERROR.code:
          return t("Something went wrong", { note: "API error" });
        case S3_ERROR_CODES.OBJECT_NOT_FOUND.code:
          return t("File not found", { note: "API error" });
        case S3_ERROR_CODES.FEATURE_DISABLED.code:
          return t("{feature} is disabled", {
            note: "API error",
            variables: {
              feature: param(err.params, "feature", "This feature"),
            },
          });
        case S3_ERROR_CODES.INVALID_KEY.code:
          return t("Object key is invalid", { note: "API error" });
        case S3_ERROR_CODES.INVALID_BUCKET.code:
          return t("Bucket is not allowed", { note: "API error" });
        case S3_ERROR_CODES.S3_NETWORK_ERROR.code:
          return t("Could not reach storage ({code})", {
            note: "API error",
            variables: { code: param(err.params, "code", "UNKNOWN") },
          });
        case S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD.code:
          return t("File size is required", { note: "upload" });
        case S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART.code:
          return t("File size is required", { note: "multipart" });
        case S3_ERROR_CODES.MULTIPART_PART_MISSING.code:
          return t("Uploaded part {partNumber} was not found", {
            note: "API error",
            variables: {
              partNumber: param(err.params, "partNumber", "?"),
            },
          });
        case S3_ERROR_CODES.VALIDATION_ERROR.code:
          return t("Invalid request", { note: "API error" });
        default:
          return err.message;
      }
    },
    [t],
  );
}
