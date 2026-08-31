import { matchesFileTypes } from "@dimah-s3/core";
import { errors } from "@/errors";
import type { UploadConfig } from "@/types";

/** File limits from `upload` (`fileTypes` / `maxFileSize`). */
export type FileConstraints = Pick<UploadConfig, "fileTypes" | "maxFileSize">;

/** Reject when `size` is over the route cap. No-op when `maxFileSize` is unset. */
export function assertWithinMaxFileSize(
  maxFileSize: number | undefined,
  size: number,
): void {
  if (maxFileSize && size > maxFileSize) {
    throw errors.payloadTooLarge();
  }
}

export function assertDeclaredConstraints(
  constraints: FileConstraints | undefined,
  input: { fileName: string; fileSize: number; contentType?: string },
): void {
  if (
    constraints?.fileTypes?.length &&
    !matchesFileTypes(input.fileName, input.contentType, constraints.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(input.fileName);
  }
  assertWithinMaxFileSize(constraints?.maxFileSize, input.fileSize);
}

export function assertVerifiedConstraints(
  constraints: FileConstraints | undefined,
  input: { fileName?: string; contentType?: string; contentLength: number },
): void {
  assertWithinMaxFileSize(constraints?.maxFileSize, input.contentLength);
  const name = input.fileName ?? "";
  if (
    constraints?.fileTypes?.length &&
    !matchesFileTypes(name, input.contentType, constraints.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(name || input.contentType || "unknown");
  }
}
