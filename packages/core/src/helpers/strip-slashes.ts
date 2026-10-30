const SLASH = "/";

/** Drop trailing `/` in linear time so a long slash run cannot backtrack. */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === SLASH) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

/** Drop leading and trailing `/` in linear time so a long slash run cannot backtrack. */
export function stripSurroundingSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charAt(start) === SLASH) start += 1;
  while (end > start && value.charAt(end - 1) === SLASH) end -= 1;
  return start === 0 && end === value.length ? value : value.slice(start, end);
}
