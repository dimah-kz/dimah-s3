import { normalizeSearchText } from "@dimah-s3/core";
import { toTimestamp } from "@/helpers/to-timestamp";
import { normalizeFolder, readObjectListLevel } from "./read-object-list-level";
import type {
  ObjectListFile,
  ObjectListFolder,
  ObjectListSearchScope,
  ObjectListSort,
  ObjectListSource,
  ObjectListUsageData,
} from "./types";

const DEFAULT_PAGE_SIZE = 50;

type SortValue = string | number | null | undefined;

/** Options for {@link memoryObjectSource}. */
export type MemoryObjectSourceOptions<TItem> = {
  /** Stable id for a record. */
  getId: (item: TItem) => string;
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
   * the record count, over every record, in every folder. `limits` are the
   * caps for that whole set. A folder row's own size is separate.
   * @default true when `limits` is set, otherwise false
   */
  usage?: boolean;
  /** Caps sent as `usage.maxBytes` and `usage.maxFiles`. */
  limits?: { maxBytes?: number; maxFiles?: number };
  /**
   * Whether a record matches the search text. Defaults to the file name
   * containing it, folded with `matchesSearchText` from `@dimah-s3/core`:
   * case, accents, and look-alike letters do not count. Folder names
   * always match that way.
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
 * With `getFolder`, a search reaches every folder below the open one
 * (`searchScope: "folder"`) or every record (`"all"`), and returns the
 * folders whose name matches too. `getFile` adds each record's `location`.
 *
 * Pass a function to read the latest records on each request, for example
 * from a ref you append to after an upload. With `getFolder`,
 * `listFolderKeys` names the records in a folder and below it. Add
 * `createFolder`, `deleteFolder`, `moveFile`, and the others that change
 * your records yourself.
 *
 * ```ts
 * const list = useObjectList(
 *   memoryObjectSource(files, {
 *     getId: (file) => file.id,
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
  const { getId, getFolder, matches, sortValue, limits } = options;
  const sendUsage = options.usage ?? limits !== undefined;
  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  // Folder ids are paths, so a record's location follows from its folder.
  const getFile = getFolder
    ? (item: TItem): ObjectListFile => ({
        ...options.getFile(item),
        location: trailOf(normalizeFolder(getFolder(item))),
      })
    : options.getFile;

  return {
    getId,
    getFile,
    ...(getFolder && {
      searchScopes: SEARCH_SCOPES,
      // Every record whose path is the folder or below it.
      listFolderKeys({ folder }) {
        const all = typeof records === "function" ? records() : records;
        const path = normalizeFolder(folder.id);
        const prefix = `${path}/`;
        return Promise.resolve(
          all.flatMap((item) => {
            const at = normalizeFolder(getFolder(item));
            if (at !== path && !(at?.startsWith(prefix) ?? false)) return [];
            return [options.getFile(item).objectKey || getId(item)];
          }),
        );
      },
    }),
    query({ parent, cursor, sort, search, searchScope }) {
      const all = typeof records === "function" ? records() : records;
      // Folded once per query, not once per record.
      const needle = normalizeSearchText(search);
      const searching = needle !== "";
      const matchesName = (name: string) =>
        normalizeSearchText(name).includes(needle);
      const matchesItem = matches
        ? (item: TItem) => matches(item, search)
        : (item: TItem) => matchesName(options.getFile(item).name);
      let folders: readonly ObjectListFolder[];
      let items: readonly TItem[];
      if (searching && getFolder) {
        ({ folders, items } = searchTree(all, {
          below: searchScope === "all" ? null : normalizeFolder(parent),
          getFolder,
          matchesItem,
          matchesName,
        }));
      } else {
        const level = getFolder
          ? readObjectListLevel(all, { parent, getFolder })
          : { folders: [], items: parent == null ? [...all] : [] };
        folders = level.folders;
        items = level.items;
        if (searching) {
          folders = folders.filter((folder) => matchesName(folder.name));
          items = items.filter(matchesItem);
        }
      }
      if (sort) {
        items = sortRecords(items, sort, (item) =>
          readSortValue(options.getFile(item), sort.field, () =>
            sortValue?.(item, sort.field),
          ),
        );
        if (sort.field === "name" && sort.direction === "desc") {
          folders = [...folders].reverse();
        }
      }
      if (getFolder && folders.length > 0) {
        folders = applyFolderTotals(folders, all, getFolder, options.getFile);
      }

      const start = readOffset(cursor);
      const end = start + pageSize;
      return Promise.resolve({
        folders: start === 0 ? folders : undefined,
        items: items.slice(start, end),
        nextCursor: end < items.length ? String(end) : null,
        usage: sendUsage
          ? { ...totals(all, options.getFile), ...limits }
          : undefined,
        ...(searching && start === 0 && { total: items.length }),
      });
    },
  };
}

const SEARCH_SCOPES: readonly ObjectListSearchScope[] = ["folder", "all"];

/** The folders from the root down to `path`, root excluded. Ids are paths. */
function trailOf(path: string | null): ObjectListFolder[] {
  if (path === null) return [];
  const names = path.split("/");
  return names.map((name, index) => ({
    id: names.slice(0, index + 1).join("/"),
    name,
  }));
}

/**
 * Records and folders that match `search` in `below` and every folder
 * under it (`null`: everywhere). Folders are named by path, with their
 * location, by name.
 */
function searchTree<TItem>(
  records: readonly TItem[],
  options: {
    below: string | null;
    getFolder: (item: TItem) => string | null | undefined;
    matchesItem: (item: TItem) => boolean;
    matchesName: (name: string) => boolean;
  },
): { folders: ObjectListFolder[]; items: TItem[] } {
  const { below } = options;
  const prefix = below === null ? "" : `${below}/`;
  const inside = (path: string | null) =>
    below === null || path === below || (path?.startsWith(prefix) ?? false);
  const items: TItem[] = [];
  const paths = new Set<string>();
  for (const record of records) {
    const path = normalizeFolder(options.getFolder(record));
    if (!inside(path)) continue;
    if (options.matchesItem(record)) items.push(record);
    if (path === null) continue;
    // Every folder on the way down exists, also one without files.
    const names = path.split("/");
    for (let depth = 1; depth <= names.length; depth++) {
      paths.add(names.slice(0, depth).join("/"));
    }
  }
  const folders: ObjectListFolder[] = [];
  for (const path of paths) {
    if (path === below || !inside(path)) continue;
    const cut = path.lastIndexOf("/");
    const name = path.slice(cut + 1);
    if (!options.matchesName(name)) continue;
    folders.push({
      id: path,
      name,
      location: trailOf(cut < 0 ? null : path.slice(0, cut)),
    });
  }
  folders.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }) || a.id.localeCompare(b.id),
  );
  return { folders, items };
}

function readOffset(cursor: string | null): number {
  const offset = cursor ? Number(cursor) : 0;
  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}

/**
 * Puts each folder's file count, and its byte total when a record has a
 * size, onto the folder. A file counts for its folder and every folder
 * above it.
 */
function applyFolderTotals<TItem>(
  folders: readonly ObjectListFolder[],
  records: readonly TItem[],
  getFolder: (item: TItem) => string | null | undefined,
  getFile: (item: TItem) => ObjectListFile,
): ObjectListFolder[] {
  const totals = new Map<
    string,
    { bytes: number; known: boolean; count: number }
  >();
  for (const record of records) {
    const path = normalizeFolder(getFolder(record));
    if (path == null) continue;
    const size = getFile(record).size;
    const known = size != null && Number.isFinite(size);
    const names = path.split("/");
    let id = "";
    for (const name of names) {
      id = id.length === 0 ? name : `${id}/${name}`;
      const row = totals.get(id) ?? { bytes: 0, known: false, count: 0 };
      row.count += 1;
      if (known && size != null) {
        row.bytes += size;
        row.known = true;
      }
      totals.set(id, row);
    }
  }
  return folders.map((folder) => {
    const row = totals.get(folder.id);
    if (!row) return folder;
    return {
      ...folder,
      objectCount: row.count,
      ...(row.known ? { size: row.bytes } : {}),
    };
  });
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
