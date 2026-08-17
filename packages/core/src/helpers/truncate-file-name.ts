/**
 * Truncates a filename while preserving the extension when possible.
 */
export function truncateFileName(name: string, maxChars = 48): string {
  if (name.length <= maxChars) return name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) {
    return name.slice(0, maxChars - 1) + "…";
  }
  const ext = name.slice(dotIndex);
  const available = maxChars - ext.length - 1;
  if (available <= 0) {
    return name.slice(0, maxChars - 1) + "…";
  }
  return name.slice(0, available) + "… " + ext;
}
