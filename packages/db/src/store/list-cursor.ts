import { base64UrlDecode, base64UrlEncode } from "@dimah-s3/core";
import type { DbListSort, DbListSortField } from "@/types/client";
import type {
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";

/** Listing order when none is given: newest first. */
export const DEFAULT_LIST_SORT: DbListSort = {
  field: "createdAt",
  direction: "desc",
};

/** What a listing is filtered and ordered by. A cursor is only valid for these. */
export type ListCursorFilters = {
  /** `undefined` lists every folder; `null` is the root. */
  folderId: string | null | undefined;
  search: string | undefined;
  status: StorageObjectStatus;
  route: string | undefined;
  contentType: string | undefined;
  sort: DbListSort;
};

/** Position after one row: its sort value (`null` when it has none) and `id`. */
export type ListCursor = {
  value: Date | number | string | null;
  id: string;
};

/** The JSON a cursor encodes. */
type CursorPayload = {
  /** Fingerprint of the filters. */
  f: string;
  /** Sort value of the last row. Dates are ISO strings. */
  v: string | number | null;
  /** `id` of the last row. */
  i: string;
};

const decoder = new TextDecoder();

/**
 * A short FNV-1a hash of the filters. It only tells filter sets apart, so a
 * collision restarts nothing: the scope never comes from the cursor.
 */
function fingerprint(filters: ListCursorFilters): string {
  const text = JSON.stringify([
    filters.folderId === undefined,
    filters.folderId ?? null,
    filters.search ?? null,
    filters.status,
    filters.route ?? null,
    filters.contentType ?? null,
    filters.sort.field,
    filters.sort.direction,
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Encodes the position after `object` in a listing under `filters`. */
export function encodeListCursor(
  filters: ListCursorFilters,
  object: StorageObject<unknown>,
): string {
  const value = object[filters.sort.field];
  const payload: CursorPayload = {
    f: fingerprint(filters),
    v: value instanceof Date ? value.toISOString() : value,
    i: object.id,
  };
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decodes a cursor for a listing under `filters`. Returns `null` when the
 * cursor is malformed or was made under other filters, so the listing
 * starts again at the first row.
 */
export function decodeListCursor(
  cursor: string,
  filters: ListCursorFilters,
): ListCursor | null {
  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(base64UrlDecode(cursor)));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { f, v, i } = payload as Partial<CursorPayload>;
  if (f !== fingerprint(filters) || typeof i !== "string" || !i) return null;
  const value = decodeValue(filters.sort.field, v);
  return value === undefined ? null : { value, id: i };
}

/** Reads a sort value back. `undefined` when it does not fit the field. */
function decodeValue(
  field: DbListSortField,
  value: unknown,
): ListCursor["value"] | undefined {
  switch (field) {
    case "createdAt":
    case "updatedAt": {
      if (typeof value !== "string") return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    case "size":
      return value === null ||
        (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
        ? value
        : undefined;
    case "filename":
      return typeof value === "string" ? value : undefined;
  }
}
