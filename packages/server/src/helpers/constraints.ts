import { matchesFileTypes } from "@dimah-s3/core";
import { errors } from "@/errors";
import type { UploadConfig } from "@/types";

export function assertDeclaredConstraints(
  upload: UploadConfig | undefined,
  input: { fileName: string; fileSize: number; contentType?: string },
): void {
  if (
    upload?.fileTypes?.length &&
    !matchesFileTypes(input.fileName, input.contentType, upload.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(input.fileName);
  }
  if (upload?.maxFileSize && input.fileSize > upload.maxFileSize) {
    throw errors.payloadTooLarge();
  }
}

export function assertVerifiedConstraints(
  upload: UploadConfig | undefined,
  input: { fileName?: string; contentType?: string; contentLength: number },
): void {
  if (upload?.maxFileSize && input.contentLength > upload.maxFileSize) {
    throw errors.payloadTooLarge();
  }
  const name = input.fileName ?? "";
  if (
    upload?.fileTypes?.length &&
    !matchesFileTypes(name, input.contentType, upload.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(name || input.contentType || "unknown");
  }
}
