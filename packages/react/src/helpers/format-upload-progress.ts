import { formatFileSize } from "@dimah-s3/core";

/**
 * Formats upload progress as a human-readable transfer string.
 *
 * @param loaded   Bytes transferred so far.
 * @param total    Total bytes to transfer (0 means unknown).
 * @param percent  Transfer percentage (0–100).
 *
 * @example
 * ```ts
 * formatUploadProgress(1_200_000, 5_600_000, 21)
 * // → "1.2 MB / 5.6 MB (21%)"
 *
 * formatUploadProgress(1_200_000, 0, 0)
 * // → "1.2 MB"
 * ```
 */
export function formatUploadProgress(
  loaded: number,
  total: number,
  percent: number,
): string {
  const loadedStr = formatFileSize(loaded);
  if (!total) return loadedStr;
  return `${loadedStr} / ${formatFileSize(total)} (${Math.round(percent)}%)`;
}
