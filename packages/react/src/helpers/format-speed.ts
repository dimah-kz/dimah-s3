import { formatFileSize } from "@dimah-s3/core";

/**
 * Formats a transfer speed (bytes/second) as a human-readable string.
 *
 * @example
 * formatSpeed(1_200_000) // → "1.2 MB/s"
 * formatSpeed(512)       // → "512 B/s"
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}
