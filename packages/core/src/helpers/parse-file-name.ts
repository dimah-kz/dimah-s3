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

/** Last path segment of an object key (`uploads/uuid/a.png` → `a.png`). */
export function fileNameFromKey(key: string): string | undefined {
  return key
    .split("/")
    .filter((part) => part.length > 0)
    .at(-1);
}

/**
 * Filename from `Content-Disposition`, falling back to the object key leaf.
 * Used after HeadObject when the disposition header is missing.
 */
export function resolveStoredFileName(
  contentDisposition: string | null | undefined,
  key: string,
): string | undefined {
  return parseFileName(contentDisposition) ?? fileNameFromKey(key);
}
