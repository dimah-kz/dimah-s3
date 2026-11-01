/**
 * Truncates a filename to at most `maxChars` characters, keeping the
 * extension when it fits: `a-very-long-name….pdf`. It counts and cuts code
 * points, so an emoji is never split.
 */
export function truncateFileName(name: string, maxChars = 48): string {
  const chars = Array.from(name);
  if (chars.length <= maxChars) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? Array.from(name.slice(dot)) : [];
  const stemBudget = maxChars - ext.length - 1;
  if (ext.length === 0 || stemBudget <= 0) {
    return `${chars.slice(0, Math.max(maxChars - 1, 0)).join("")}…`;
  }
  return `${chars.slice(0, stemBudget).join("")}…${ext.join("")}`;
}
