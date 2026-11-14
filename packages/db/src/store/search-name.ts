import { normalizeSearchText } from "@dimah-s3/core";
import { SEARCH_NAME_MAX_LENGTH } from "@/schema/schema";

/**
 * `LIKE` reads `%` and `_` as wildcards, and PostgreSQL and MySQL read `\`
 * as an escape. The search column and the search text both store them as
 * private-use characters, which no name or search contains, so they match
 * as the text they are.
 */
const LIKE_LITERALS: Readonly<Record<string, string>> = {
  "%": "\uE000",
  _: "\uE001",
  "\\": "\uE002",
};

/**
 * The `search_name` of a file or folder name, or the text a search looks
 * for: folded with `normalizeSearchText` from `@dimah-s3/core`, with the
 * `LIKE` specials kept literal, and cut to the column's length.
 */
export function toSearchName(value: string): string {
  const folded = normalizeSearchText(value).replaceAll(
    /[%_\\]/g,
    (char) => LIKE_LITERALS[char] ?? char,
  );
  const characters = Array.from(folded);
  return characters.length > SEARCH_NAME_MAX_LENGTH
    ? characters.slice(0, SEARCH_NAME_MAX_LENGTH).join("")
    : folded;
}
