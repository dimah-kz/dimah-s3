import { matchesFileTypes } from "@dimah-s3/core";
import { errors } from "@/errors";
import type { ResolvedRoutePolicy } from "@/types";

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
  if (route.maxFileSize && input.fileSize > route.maxFileSize) {
    throw errors.payloadTooLarge();
  }
}

export function assertVerifiedConstraints(
  route: Pick<ResolvedRoutePolicy, "fileTypes" | "maxFileSize">,
  input: { fileName?: string; contentType?: string; contentLength: number },
): void {
  if (route.maxFileSize && input.contentLength > route.maxFileSize) {
    throw errors.payloadTooLarge();
  }
  const name = input.fileName ?? "";
  if (
    route.fileTypes?.length &&
    !matchesFileTypes(name, input.contentType, route.fileTypes)
  ) {
    throw errors.fileTypeNotAllowed(name || input.contentType || "unknown");
  }
}
