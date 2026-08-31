import { matchesFileTypes } from "@dimah-s3/core";
import { errors } from "@/errors";
import type { ResolvedRoutePolicy } from "@/types";

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
  route: Pick<ResolvedRoutePolicy, "fileTypes" | "maxFileSize">,
  input: { fileName: string; fileSize: number; contentType?: string },
): void {
  if (
    route.fileTypes?.length &&
    !matchesFileTypes(input.fileName, input.contentType, route.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(input.fileName);
  }
  assertWithinMaxFileSize(route.maxFileSize, input.fileSize);
}

export function assertVerifiedConstraints(
  route: Pick<ResolvedRoutePolicy, "fileTypes" | "maxFileSize">,
  input: { fileName?: string; contentType?: string; contentLength: number },
): void {
  assertWithinMaxFileSize(route.maxFileSize, input.contentLength);
  const name = input.fileName ?? "";
  if (
    route.fileTypes?.length &&
    !matchesFileTypes(name, input.contentType, route.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(name || input.contentType || "unknown");
  }
}
