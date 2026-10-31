import type { UploadRequestOptions } from "@/types/upload";

/**
 * Stable client-side identity for multipart resume: the route, the file, and
 * the `request` options passed to `uploadFile`. A stored upload resumes only
 * for the same file sent with the same name, type and metadata, so it never
 * completes into another folder. The S3 object key is server-generated and
 * unknown until init.
 */
export function multipartResumeKey(
  route: string,
  file: File,
  request: UploadRequestOptions = {},
): string {
  const key = `${route}:${file.name}:${file.size}:${file.lastModified}`;
  const { fileName = "", contentType = "", metadata = {} } = request;
  // Sorted, so the key does not depend on the order metadata was built in.
  const entries = Object.entries(metadata).toSorted(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (!fileName && !contentType && entries.length === 0) return key;
  return `${key}:${JSON.stringify([fileName, contentType, entries])}`;
}
