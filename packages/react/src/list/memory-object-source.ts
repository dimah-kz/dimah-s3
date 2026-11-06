import { toTimestamp } from "@/helpers/to-timestamp";
import { readObjectListLevel } from "./read-object-list-level";
import type {
  ObjectListFile,
  ObjectListFolder,
  ObjectListSort,
  ObjectListSource,
  ObjectListUsageData,
} from "./types";

const DEFAULT_PAGE_SIZE = 50;

type SortValue = string | number | null | undefined;

/** Options for {@link memoryObjectSource}. */
export type MemoryObjectSourceOptions<TItem> = {
  /** Stable id for a record. */
  getKey: (item: TItem) => string;
  /** Name, object key, size, type, and date for a record. */
  getFile: (item: TItem) => ObjectListFile;
  /**
   * `/`-separated folder path, or `null` for the root. Omit it and every
   * record sits at the root.
   */
  getFolder?: (item: TItem) => string | null | undefined;
  /** Files per page. @default 50 */
  pageSize?: number;
  /**
   * Send `usage` with each page: the byte total from `getFile().size` and
   * the record count, over every record — not only the open folder.
   * @default true when `limits` is set, otherwise false
   */
  usage?: boolean;
  /** Caps sent as `usage.maxBytes` and `usage.maxFiles`. */
  limits?: { maxBytes?: number; maxFiles?: number };
  /**
   * Whether a record matches the search text. Defaults to the file name
   * containing it, ignoring case and accents. Folder names always match
   * that way.
   */
  matches?: (item: TItem, search: string) => boolean;
  /**
   * Value to order by for a field other than `name`, `size`, and
   * `updatedAt`. `null` sorts last.
   */
  sortValue?: (item: TItem, field: string) => SortValue;
};

/**
 * A `useObjectList` source over records you already hold: folders from
 * `getFolder`, then search, sort, and pages on the client.
 *
 * Pass a function to read the latest records on each request, for example
 * from a ref you append to after an upload.
 *
 * ```ts
 * const list = useObjectList(
 *   memoryObjectSource(files, {
 *     getKey: (file) => file.id,
 *     getFile: (file) => ({ name: file.name, size: file.size }),
 *     getFolder: (file) => file.folder,
 *   }),
 * );
 * ```
 */
export function memoryObjectSource<TItem>(
  records: readonly TItem[] | (() => readonly TItem[]),
  options: MemoryObjectSourceOptions<TItem>,
): ObjectListSource<TItem> & { getFile: (item: TItem) => ObjectListFile } {
  const { getKey, getFile, getFolder, matches, sortValue, limits } = options;
  const sendUsage = options.usage ?? limits !== undefined;
  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE),
  );

  return {
    getKey,
    getFile,
    query({ parent, cursor, sort, search }) {
      const all = typeof records === "function" ? records() : records;
      const level = getFolder
        ? readObjectListLevel(all, { parent, getFolder })
        : { folders: [], items: parent == null ? [...all] : [] };

      let folders: readonly ObjectListFolder[] = level.folders;
      let items: readonly TItem[] = level.items;
      const needle = normalizeSearch(search);
      if (needle) {
        folders = folders.filter((folder) =>
          normalizeSearch(folder.name).includes(needle),
        );
        items = items.filter((item) =>
          matches
            ? matches(item, search)
            : normalizeSearch(getFile(item).name).includes(needle),
        );
      }
      if (sort) {
        items = sortRecords(items, sort, (item) =>
          readSortValue(getFile(item), sort.field, () =>
            sortValue?.(item, sort.field),
          ),
        );
        if (sort.field === "name" && sort.direction === "desc") {
          folders = [...folders].reverse();
        }
      }

      const start = readOffset(cursor);
      const end = start + pageSize;
      return Promise.resolve({
        folders: start === 0 ? folders : undefined,
        items: items.slice(start, end),
        nextCursor: end < items.length ? String(end) : null,
        usage: sendUsage ? { ...totals(all, getFile), ...limits } : undefined,
      });
    },
  };
}

function readOffset(cursor: string | null): number {
  const offset = cursor ? Number(cursor) : 0;
  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}

function totals<TItem>(
  records: readonly TItem[],
  getFile: (item: TItem) => ObjectListFile,
): ObjectListUsageData {
  let totalBytes = 0;
  for (const record of records) {
    const size = getFile(record).size;
    if (size != null && Number.isFinite(size)) totalBytes += size;
  }
  return { totalBytes, objectCount: records.length };
}

/** Lower case, accents removed, trimmed. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

function readSortValue(
  file: ObjectListFile,
  field: string,
  custom: () => SortValue,
): SortValue {
  if (field === "name") return file.name;
  if (field === "size") return file.size;
  if (field === "updatedAt") return toTimestamp(file.updatedAt);
  return custom();
}

function sortRecords<TItem>(
  items: readonly TItem[],
  sort: ObjectListSort,
  valueOf: (item: TItem) => SortValue,
): TItem[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return items
    .map((item) => ({ item, value: valueOf(item) }))
    .sort((a, b) => {
      // Missing values stay last in both directions.
      if (a.value == null || b.value == null) {
        return a.value == null ? (b.value == null ? 0 : 1) : -1;
      }
      return compareValues(a.value, b.value) * direction;
    })
    .map((entry) => entry.item);
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
