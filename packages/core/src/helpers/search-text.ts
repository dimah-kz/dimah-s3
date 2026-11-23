/**
 * How a name matches search text. The `db()` search column, the in-memory
 * list source, and the list's match highlight all fold text this way, so a
 * name matches the same text everywhere.
 *
 * Folding lowercases, drops accents and other combining marks, joins
 * look-alike letters that keyboards type interchangeably (Arabic and
 * Persian `ي`/`ی` and `ك`/`ک`, Greek final `ς`, German `ß`), reads Persian
 * and Arabic-Indic digits as `0`–`9`, removes zero-width joiners and the
 * tatweel, and collapses whitespace to one space.
 */

const MARK = /\p{M}/u;
const SPACE = /\s/u;
/** Tatweel, zero-width space, non-joiner and joiner, word joiner, and BOM. */
const DROPPED = /[\u0640\u200B-\u200D\u2060\uFEFF]/u;

/** Letters that fold onto another, after lowercasing. */
const LOOK_ALIKE: Readonly<Record<string, string>> = {
  "\u064A": "\u06CC", // Arabic yeh -> Persian yeh
  "\u0649": "\u06CC", // alef maksura -> Persian yeh
  "\u0643": "\u06A9", // Arabic kaf -> keheh
  "\u03C2": "\u03C3", // final sigma -> sigma
  ß: "ss", // sharp s
};

/** Arabic-Indic (U+0660) and Persian (U+06F0) digits as ASCII. */
function asciiDigit(char: string): string | undefined {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return undefined;
}

/** The folded form of one code point. Empty when it folds away. */
function foldCharacter(char: string): string {
  let folded = "";
  for (const part of char.toLowerCase().normalize("NFKD")) {
    if (MARK.test(part) || DROPPED.test(part) || SPACE.test(part)) continue;
    folded += LOOK_ALIKE[part] ?? asciiDigit(part) ?? part;
  }
  return folded;
}

/**
 * Folded text, with where each of its code units came from in the source:
 * `starts[i]` and `ends[i]` bound the source character of `text[i]`.
 */
type FoldedText = { text: string; starts: number[]; ends: number[] };

function foldText(value: string): FoldedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  /** Where the code units of the last character kept start in `text`. */
  let last = 0;
  const push = (folded: string, start: number, end: number) => {
    last = text.length;
    text += folded;
    for (let index = 0; index < folded.length; index++) {
      starts.push(start);
      ends.push(end);
    }
  };
  let offset = 0;
  /** Source range of the whitespace run since the last character kept. */
  let space: [number, number] | null = null;
  for (const char of value) {
    const start = offset;
    offset += char.length;
    if (SPACE.test(char)) {
      space = [space?.[0] ?? start, offset];
      continue;
    }
    const folded = foldCharacter(char);
    if (!folded) {
      // A combining mark belongs to the character before it.
      if (!space)
        for (let index = last; index < ends.length; index++)
          ends[index] = offset;
      continue;
    }
    // One space between words; none at the edges.
    if (space && text) push(" ", space[0], space[1]);
    space = null;
    push(folded, start, offset);
  }
  return { text, starts, ends };
}

/**
 * `value` folded for matching: lowercase, without accents, look-alike
 * letters joined, digits as ASCII, and whitespace collapsed and trimmed.
 *
 * ```ts
 * normalizeSearchText("  Résumé  Final.PDF") // "resume final.pdf"
 * normalizeSearchText("گزارش ۱۴۰۲")          // "گزارش 1402"
 * ```
 */
export function normalizeSearchText(value: string): string {
  return foldText(value).text;
}

/**
 * Whether `text` contains `search` once both are folded with
 * {@link normalizeSearchText}. Blank search text matches everything.
 */
export function matchesSearchText(text: string, search: string): boolean {
  const needle = normalizeSearchText(search);
  return needle === "" || normalizeSearchText(text).includes(needle);
}

/**
 * Where `search` occurs in `text`, as `[start, end)` ranges of `text`
 * (UTF-16 indices), in order and without overlaps. Matching folds both
 * sides like {@link matchesSearchText}, so `"cafe"` finds `"Café"`. Blank
 * search text finds nothing.
 */
export function findSearchMatches(
  text: string,
  search: string,
): [start: number, end: number][] {
  const needle = normalizeSearchText(search);
  if (!needle) return [];
  const folded = foldText(text);
  const ranges: [number, number][] = [];
  let from = 0;
  for (;;) {
    const at = folded.text.indexOf(needle, from);
    if (at < 0) break;
    from = at + needle.length;
    const start = folded.starts[at] ?? 0;
    const end = folded.ends[from - 1] ?? text.length;
    const previous = ranges.at(-1);
    // Two matches inside one source character (`ß` holds `ss`) merge.
    if (previous && start <= previous[1])
      previous[1] = Math.max(end, previous[1]);
    else ranges.push([start, end]);
  }
  return ranges;
}
