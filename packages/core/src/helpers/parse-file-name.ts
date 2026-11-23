/** `filename*=charset'lang'value` (RFC 5987), the language optional. */
const EXT_VALUE = /filename\*\s*=\s*([\w!#$&+.^`|~-]+)'[^']*'([^;\s]+)/i;

/** `filename="…"`, where `\` escapes the next character. */
const QUOTED = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i;

/** `filename=token`, unquoted. */
const TOKEN = /filename\s*=\s*([^";\s]+)/i;

/**
 * The file name of a `Content-Disposition` value (RFC 6266), whoever wrote
 * it: the UTF-8 `filename*` first, then a quoted `filename` with its
 * escapes undone, then a bare token. `undefined` when it names none.
 */
export function parseFileName(
  contentDisposition: string | null | undefined,
): string | undefined {
  if (!contentDisposition) return undefined;

  const ext = EXT_VALUE.exec(contentDisposition);
  if (ext && /^utf-8$/i.test(ext[1])) {
    try {
      return decodeURIComponent(ext[2]);
    } catch {
      /* ignore malformed encoding */
    }
  }

  const quoted = QUOTED.exec(contentDisposition);
  if (quoted) return quoted[1].replaceAll(/\\(.)/g, "$1");
  return TOKEN.exec(contentDisposition)?.[1];
}

/** Last path segment of an object key (`uploads/uuid/a.png` → `a.png`). */
export function fileNameFromKey(key: string): string | undefined {
  return key.split("/").findLast((part) => part.length > 0);
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
