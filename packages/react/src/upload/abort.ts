import type { UploadAbortKind } from "@/types/upload";

/**
 * The abort reason for an upload: an `AbortError` `DOMException` whose
 * message is `kind`. Abort an upload's signal with it to pick what happens
 * to a stored multipart upload.
 */
export function uploadAbortReason(kind: UploadAbortKind): DOMException {
  return new DOMException(kind, "AbortError");
}

/** The kind of an abort reason made by {@link uploadAbortReason}, else `null`. */
export function getUploadAbortKind(reason: unknown): UploadAbortKind | null {
  if (!(reason instanceof DOMException) || reason.name !== "AbortError") {
    return null;
  }
  const kind = reason.message;
  return kind === "cancel" || kind === "detach" ? kind : null;
}
