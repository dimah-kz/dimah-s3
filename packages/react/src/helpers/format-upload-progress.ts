import { formatFileSize, type FormatFileSizeOptions } from "@dimah-s3/core";

/**
 * Formats upload progress as a human-readable transfer string.
 *
 * @param loaded   Bytes transferred so far.
 * @param total    Total bytes to transfer (0 means unknown).
 * @param percent  Transfer percentage (0–100).
 * @param options  Locale and unit labels for the sizes.
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
  options?: FormatFileSizeOptions,
): string {
  const loadedStr = formatFileSize(loaded, options);
  if (!total) return loadedStr;
  return `${loadedStr} / ${formatFileSize(total, options)} (${Math.round(percent)}%)`;
}
