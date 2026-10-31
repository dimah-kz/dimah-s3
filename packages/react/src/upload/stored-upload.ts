import type { StoredUpload } from "@/types/upload-store";

/**
 * Whether `value` has the {@link StoredUpload} shape. Records from 1.x (no
 * ticket or part layout) fail this check.
 */
export function isStoredUpload(value: unknown): value is StoredUpload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<keyof StoredUpload, unknown>;
  return (
    isText(record.resumeKey) &&
    isText(record.ticket) &&
    isText(record.key) &&
    isText(record.uploadId) &&
    isCount(record.fileSize) &&
    isCount(record.partSize) &&
    isCount(record.partCount) &&
    typeof record.checksum === "boolean"
  );
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
