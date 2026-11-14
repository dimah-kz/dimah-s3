---
packages:
  "@dimah-s3/core": minor
---

### One way to match search text

`@dimah-s3/core` exports the folding that list search uses everywhere, so your own source or renderer matches names the way `db()` and `memoryObjectSource` do.

- **`normalizeSearchText(value)`** lowercases, drops accents and other combining marks, joins look-alike letters (`ي`/`ی`, `ك`/`ک`, final `ς`, `ß` as `ss`), reads Persian and Arabic-Indic digits as `0`–`9`, removes zero-width joiners and the tatweel, and collapses whitespace.
- **`matchesSearchText(text, search)`** is true when the folded `text` contains the folded `search`. Blank search text matches everything.
- **`findSearchMatches(text, search)`** returns the `[start, end)` ranges of each match in `text`, for a highlight. A combining accent stays with its letter.
