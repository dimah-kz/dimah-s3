/**
 * Formats an estimated remaining time given the remaining bytes and current speed.
 *
 * Returns `null` when speed is 0 or nothing remains (not yet calculable).
 *
 * @example
 * formatEta(4_400_000, 450_000)    // → "9s"
 * formatEta(4_400_000, 75_000)     // → "58s"
 * formatEta(90_000_000, 1_500_000) // → "1m"
 * formatEta(5_400_000_000, 500_000) // → "3h"
 */
export function formatEta(
  remainingBytes: number,
  bytesPerSecond: number,
): string | null {
  if (bytesPerSecond <= 0 || remainingBytes <= 0) return null;
  const totalSeconds = remainingBytes / bytesPerSecond;

  if (totalSeconds < 60) return `${Math.ceil(totalSeconds)}s`;

  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) return `${Math.ceil(totalMinutes)}m`;

  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.ceil(totalMinutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
