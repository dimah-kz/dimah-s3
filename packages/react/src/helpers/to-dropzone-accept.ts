import type { Accept } from "react-dropzone";

/**
 * HTML `accept` family wildcards.
 * @see https://html.spec.whatwg.org/multipage/input.html#attr-input-accept
 */
const FAMILY_WILDCARD = new Set(["audio/*", "image/*", "video/*"]);

/**
 * Carrier MIME so react-dropzone has a valid key for extension-only tokens.
 * Dropzone keys must be MIME types; extensions live in the value array.
 * Drag-over only sees `DataTransferItem.type` (no filename), so this key
 * never matches during drag — extension checks run on drop/selection.
 */
const EXT_CARRIER = "application/x-dimah-accept";

/**
 * Whether a token is a MIME-shaped HTML accept specifier: `image|audio|video/*`
 * or a MIME type with no parameters and no wildcards.
 */
function isMimeAcceptToken(token: string): boolean {
  if (FAMILY_WILDCARD.has(token)) return true;
  const slash = token.indexOf("/");
  if (slash < 1) return false;
  const type = token.slice(0, slash);
  const subtype = token.slice(slash + 1);
  return (
    type.length > 0 &&
    subtype.length > 0 &&
    !type.includes("*") &&
    !subtype.includes("*") &&
    !subtype.includes(";")
  );
}

/**
 * Convert dimah-s3 `accept: string[]` (HTML accept tokens) into react-dropzone's
 * `{ [mime]: extensions }` map. Dropzone keys must be MIME types.
 *
 * MIME tokens (`image/*`, `application/pdf`) become keys and drive drag-over
 * highlighting. Extensions (`.pdf`) are grouped on a private carrier MIME so
 * drop/selection still match them without a hand-maintained IANA table.
 *
 * @internal
 */
export function toDropzoneAccept(
  accept: string[] | undefined,
): Accept | undefined {
  if (accept == null || accept.length === 0) return undefined;

  const map: Record<string, string[]> = {};
  const exts: string[] = [];

  for (const raw of accept) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;

    if (token.startsWith(".")) {
      if (token.length >= 2 && !exts.includes(token)) exts.push(token);
      continue;
    }

    if (isMimeAcceptToken(token)) map[token] ??= [];
  }

  if (exts.length > 0) map[EXT_CARRIER] = exts;

  return Object.keys(map).length > 0 ? map : undefined;
}

/** Comma-separated HTML `accept` attribute from the same token list. */
export function toHtmlAcceptAttr(
  accept: string[] | undefined,
): string | undefined {
  if (accept == null || accept.length === 0) return undefined;
  const tokens = accept.map((t) => t.trim()).filter(Boolean);
  return tokens.length > 0 ? tokens.join(",") : undefined;
}
