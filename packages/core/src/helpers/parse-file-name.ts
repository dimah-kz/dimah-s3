export function parseFileName(
  contentDisposition: string | null | undefined,
): string | undefined {
  if (!contentDisposition) return undefined;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;,\s]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      /* ignore malformed encoding */
    }
  }

  const asciiMatch = contentDisposition.match(/filename="([^"]*)"/i);
  return asciiMatch?.[1];
}
