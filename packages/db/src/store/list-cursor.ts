import type {
  DbListSort,
  DbListSortField,
  StorageObject,
} from "@/types/storage-object";

/** Listing order when none is given: newest first. */
export const DEFAULT_LIST_SORT: DbListSort = {
  field: "createdAt",
  direction: "desc",
};

/** Position after one row: its sort value (`null` when it has none) and `id`. */
export type ListCursor = {
  value: Date | number | string | null;
  id: string;
};

/** Encode the position after `object`. The cursor names its sort. */
export function encodeListCursor(
  sort: DbListSort,
  object: StorageObject,
): string {
  const value = object[sort.field];
  const payload = [
    sort.field,
    sort.direction,
    value instanceof Date ? value.toISOString() : value,
    object.id,
  ];
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decode a cursor for `sort`. Returns `null` when the cursor is malformed or
 * was made under another sort, so the listing starts from the first row.
 */
export function decodeListCursor(
  cursor: string,
  sort: DbListSort,
): ListCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [field, direction, value, id] = parsed as unknown[];
    if (field !== sort.field || direction !== sort.direction) return null;
    if (typeof id !== "string" || !id) return null;
    const decoded = decodeValue(sort.field, value);
    return decoded === undefined ? null : { value: decoded, id };
  } catch {
    return null;
  }
}

function decodeValue(
  field: DbListSortField,
  value: unknown,
): ListCursor["value"] | undefined {
  if (field === "createdAt") {
    if (typeof value !== "string") return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (value === null) return null;
  if (field === "size") {
    return Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : undefined;
  }
  return typeof value === "string" ? value : undefined;
}
