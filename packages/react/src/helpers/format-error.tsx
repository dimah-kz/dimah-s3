"use client";

import { useCallback, useContext } from "react";
import { S3_ERROR_CODES, isAPIError, type S3ErrorCode } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { isRawAPIError, toClientError } from "@/internal/client-error";
import { S3FormatErrorContext } from "@/s3-provider";
import { useFormatFileSize, useFormatNumber } from "./format-number";

type ErrorParams = Readonly<Record<string, string | number>>;

/**
 * Localized message for any error a dimah-s3 hook reports.
 *
 * The `S3Provider` `formatError` runs first, for any `APIError`. Then every
 * catalog code in `S3_ERROR_CODES` has its own message, with sizes and
 * counts in the `S3Provider` `locale`. Other `APIError` codes, such as a
 * plugin's, and plain `Error`s return their `message`.
 *
 * `t("…")` call sites are nested under `useTranslations()` so fuma-translate
 * can extract keys (it cannot see `t` passed into a plain helper).
 *
 * @example
 * ```tsx
 * const formatError = useFormatError();
 * if (upload.error) toast.error(formatError(upload.error));
 * ```
 */
export function useFormatError(): (error: unknown) => string {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const formatOverride = useContext(S3FormatErrorContext);

  return useCallback(
    (thrown: unknown): string => {
      const unknownError = t("Something went wrong", { note: "API error" });
      // A raw better-call error keeps its code in `body`: rebuild it first.
      const error = isRawAPIError(thrown) ? toClientError(thrown) : thrown;
      if (!isAPIError(error)) {
        return error instanceof Error && error.message
          ? error.message
          : unknownError;
      }

      const custom = formatOverride?.(error);
      if (custom) return custom;
      const { code, params = {} } = error;
      if (!isCatalogCode(code)) return error.message || unknownError;
      const text = (key: string) => readString(params, key);
      const count = (key: string) => {
        const value = readNumber(params, key);
        return value === undefined ? undefined : formatNumber(value);
      };

      switch (code) {
        case "VALIDATION_ERROR":
          return t("Invalid request", { note: "API error" });
        case "REQUEST_TOO_LARGE":
          return t("Request is too large", { note: "API error" });
        case "UNSUPPORTED_MEDIA_TYPE":
          return t("Request format is not supported", { note: "API error" });
        case "NOT_FOUND":
          return t("Not found", { note: "API error" });
        case "UNAUTHORIZED":
          return t("Unauthorized", { note: "API error" });
        case "FORBIDDEN":
          return t("Access denied", { note: "API error" });
        case "CONFLICT":
          return t("Another change happened at the same time. Try again.", {
            note: "API error",
          });
        case "TOO_MANY_REQUESTS":
          return t("Too many requests. Try again later.", {
            note: "API error",
          });
        case "INTERNAL_ERROR":
        case "HOOK_FAILED":
        case "UNKNOWN_ERROR":
          return unknownError;
        case "S3_NETWORK_ERROR": {
          const storageCode = text("code");
          return storageCode
            ? t("Could not reach storage ({code})", {
                note: "API error",
                variables: { code: storageCode },
              })
            : t("Could not reach storage", { note: "API error" });
        }
        case "ROUTE_NOT_FOUND":
          return t("Unknown file route", { note: "API error" });
        case "FEATURE_DISABLED":
          switch (text("feature")) {
            case "upload":
              return t("Uploads are disabled", { note: "API error" });
            case "download":
              return t("Downloads are disabled", { note: "API error" });
            case "delete":
              return t("Deleting is disabled", { note: "API error" });
            case "multipart":
              return t("Large uploads are disabled", { note: "API error" });
            case "proxy":
              return t("Streaming downloads are disabled", {
                note: "API error",
              });
            default:
              return t("This feature is disabled", { note: "API error" });
          }
        case "KEY_INVALID":
          return t("Object key is invalid", { note: "API error" });
        case "OBJECT_NOT_FOUND":
          return t("File not found", { note: "API error" });
        case "RANGE_NOT_SATISFIABLE":
          return t("Requested range is not available", { note: "API error" });
        case "PRECONDITION_FAILED":
          return t("The file has changed", { note: "API error" });
        case "FILE_EMPTY":
          return t("File is empty", { note: "API error" });
        case "FILE_TOO_LARGE": {
          const maxFileSize = readNumber(params, "maxFileSize");
          return maxFileSize === undefined
            ? t("File is too large", { note: "API error" })
            : t("File size exceeds {size} limit", {
                note: "API error",
                variables: { size: formatFileSize(maxFileSize) },
              });
        }
        case "FILE_TYPE_NOT_ALLOWED": {
          const type = text("type");
          return type
            ? t('File type "{type}" is not allowed', {
                note: "API error",
                variables: { type },
              })
            : t("File type is not allowed", { note: "API error" });
        }
        case "FILE_CONTENT_MISMATCH":
          return t("File content does not match its type", {
            note: "API error",
          });
        case "CHECKSUM_REQUIRED":
          return t("A file checksum is required", { note: "API error" });
        case "QUOTA_EXCEEDED":
          switch (text("limit")) {
            case "files":
              return t("File limit reached", { note: "API error" });
            case "folders":
              return t("Folder limit reached", { note: "API error" });
            default:
              return t("Storage quota exceeded", { note: "API error" });
          }
        case "UPLOAD_TICKET_INVALID":
          return t("Upload session is invalid", { note: "API error" });
        case "UPLOAD_TICKET_EXPIRED":
          return t("Upload session has expired", { note: "API error" });
        case "UPLOAD_SIZE_MISMATCH":
          return t("Uploaded size does not match the file", {
            note: "API error",
          });
        case "MULTIPART_PART_MISSING": {
          const partNumber = count("partNumber");
          return partNumber
            ? t("Uploaded part {partNumber} was not found", {
                note: "API error",
                variables: { partNumber },
              })
            : t("An uploaded part was not found", { note: "API error" });
        }
        case "MULTIPART_PART_INVALID":
          return t("Upload part is out of range", { note: "API error" });
        case "OBJECT_EXISTS":
          return t("A file with this name already exists", {
            note: "API error",
          });
        case "FOLDER_INVALID":
          return t("Folder name is invalid", { note: "API error" });
        case "FOLDER_NOT_FOUND":
          return t("Folder not found", { note: "API error" });
        case "FOLDER_EXISTS":
          return t("A folder with this name already exists", {
            note: "API error",
          });
        case "FOLDER_NOT_EMPTY":
          return t("Folder is not empty", { note: "API error" });
        case "SHARE_LINK_NOT_FOUND":
          return t("Link not found", { note: "API error" });
        case "SHARE_LINK_EXPIRED":
          return t("This link has expired", { note: "API error" });
        case "SHARE_LINK_REVOKED":
          return t("This link was turned off", { note: "API error" });
        case "SHARE_LINK_EXHAUSTED":
          return t("This link reached its download limit", {
            note: "API error",
          });
        case "SHARE_TARGET_UNAVAILABLE":
          return t("The shared item is no longer available", {
            note: "API error",
          });
        case "SHARE_PASSWORD_REQUIRED":
          return t("This link needs a password", { note: "API error" });
        case "SHARE_PASSWORD_INVALID":
          return t("Wrong password", { note: "API error" });
        case "SHARE_FOLDER_LINKS_DISABLED":
          return t("Folder links are turned off", { note: "API error" });
        case "SHARE_DOWNLOAD_URL_INVALID":
          return t("Download link is invalid or has expired", {
            note: "API error",
          });
        case "TOO_MANY_FILES": {
          const maxFiles = count("maxFiles");
          return maxFiles
            ? t("Too many files (max {maxFiles})", {
                note: "API error",
                variables: { maxFiles },
              })
            : t("Too many files", { note: "API error" });
        }
        case "NETWORK_ERROR":
          return t("Network error", { note: "API error" });
        case "UPLOAD_FAILED":
          return t("Upload failed", { note: "API error" });
        case "DOWNLOAD_FAILED":
          return t("Download failed", { note: "API error" });
        case "CHECKSUM_MISMATCH":
          return t("File changed during upload", { note: "API error" });
        case "PARTIAL_FAILURE": {
          const failed = count("failed");
          const total = count("total");
          return failed && total
            ? t("{failed} of {total} failed", {
                note: "API error",
                variables: { failed, total },
              })
            : t("Some operations failed", { note: "API error" });
        }
      }
    },
    [t, formatFileSize, formatNumber, formatOverride],
  );
}

function isCatalogCode(code: string): code is S3ErrorCode {
  return Object.hasOwn(S3_ERROR_CODES, code);
}

function readString(params: ErrorParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(params: ErrorParams, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
