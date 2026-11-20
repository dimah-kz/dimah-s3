import { s3Error } from "@dimah-s3/core";
import { DB_FOLDER_ID_KEY, DB_LIST_MAX_LIMIT } from "@/constants";
import { isFolderName } from "@/folder-path";
import type {
  DbClientActions,
  DbClientFolder,
  DbClientListObjectsInput,
  DbClientObject,
  DbListSort,
  DbListSortField,
  DbObjectSource,
  DbObjectSourceFile,
  DbObjectSourceFolder,
  DbObjectSourceOptions,
  DbObjectSourceQueryInput,
} from "@/types/client";

/** The `api.db` actions {@link dbObjectSource} calls. */
export type DbObjectSourceActions<TClientAttributes = never> = Pick<
  DbClientActions<TClientAttributes>,
  "listObjects"
> &
  Partial<
    Pick<
      DbClientActions<TClientAttributes>,
      "createFolder" | "updateObject" | "updateFolder"
    >
  >;

/** The list sort fields `listObjects` orders by. */
const SORT_FIELDS: ReadonlySet<string> = new Set<DbListSortField>([
  "name",
  "size",
  "updatedAt",
]);

function toListSort(
  sort: DbObjectSourceQueryInput["sort"],
): DbListSort | undefined {
  if (!sort || !SORT_FIELDS.has(sort.field)) return undefined;
  return {
    field: sort.field as DbListSortField,
    direction: sort.direction,
  };
}

/** `limit` as the server takes it: a whole number from 1 to the maximum. */
function pageLimit(limit: number): number {
  const rows = Math.floor(limit);
  if (Number.isNaN(rows)) return DB_LIST_MAX_LIMIT;
  return Math.min(Math.max(rows, 1), DB_LIST_MAX_LIMIT);
}

/**
 * The path to each folder in `folders`, root excluded, by walking
 * `parentId`. A folder whose parent is missing gets the part that is known.
 */
function locationsOf(
  folders: readonly DbClientFolder[],
): (folderId: string | null) => DbObjectSourceFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cache = new Map<string, DbObjectSourceFolder[]>();
  const trailTo = (folderId: string | null): DbObjectSourceFolder[] => {
    if (folderId === null) return [];
    const cached = cache.get(folderId);
    if (cached) return cached;
    const chain: DbObjectSourceFolder[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift({ id: current.id, name: current.name });
      current =
        current.parentId === null ? undefined : byId.get(current.parentId);
    }
    cache.set(folderId, chain);
    return chain;
  };
  return trailTo;
}

/**
 * A `useObjectList` source over `api.db`.
 *
 * With `folders` on (the default), `parent` is a folder id: each page lists
 * one folder, the first page carries its child folders and the breadcrumb
 * trail, uploads go to the open folder, and "New folder" calls
 * `api.db.createFolder`. Rename calls `api.db.updateObject` or
 * `api.db.updateFolder` with the new `name` and leaves the object key as it
 * is. With `folders: false`, the list is flat: file rename stays, and
 * folder actions do not.
 *
 * `search` runs on the server and ignores case and accents. With `folders`
 * on it is recursive: `searchScope: "folder"` looks in the open folder and
 * every folder below it, `"all"` in the whole scope, and each result's
 * `location` says where it lives. `sort` takes `name`, `size`, and
 * `updatedAt`; other fields keep the server's order (newest first). The
 * usage line is the scope total with its caps, not the open folder's. The
 * server sends it when the plugin sets a `quota`, or when `usage` is on.
 *
 * ```ts
 * const list = useObjectList({
 *   ...dbObjectSource(api.db, { route: "docs" }),
 *   queryKey: ["docs"],
 * });
 * ```
 */
export function dbObjectSource<TClientAttributes = never>(
  db: DbObjectSourceActions<TClientAttributes>,
  options: DbObjectSourceOptions = {},
): DbObjectSource<TClientAttributes> {
  const folders = options.folders !== false;
  const searchBelow = folders && options.recursiveSearch !== false;
  // Where each row of a search lives. Keyed by the row object, so `getFile`
  // reads it for the rows a query returned and stays pure.
  const locations = new WeakMap<object, DbObjectSourceFolder[]>();
  const toFile = (object: DbClientObject<TClientAttributes>) => {
    const file: DbObjectSourceFile = {
      name: object.name,
      objectKey: object.key,
      size: object.size,
      contentType: object.contentType,
      updatedAt: object.updatedAt,
    };
    const location = locations.get(object);
    if (location) file.location = location;
    return file;
  };

  const source: DbObjectSource<TClientAttributes> = {
    getId: (item) => item.id,
    getFile: toFile,
    async query({ parent, cursor, sort, search, searchScope, signal }) {
      const input: DbClientListObjectsInput = {};
      // A search reaches the folders below; a listing shows one folder.
      const recursive = searchBelow && search !== "";
      if (folders) {
        input.folderId =
          recursive && searchScope === "all" ? "" : (parent ?? "");
      }
      if (recursive) input.recursive = true;
      if (cursor) input.cursor = cursor;
      if (search) input.search = search;
      const listSort = toListSort(sort);
      if (listSort) input.sort = listSort;
      if (options.route) input.route = options.route;
      if (options.status) input.status = options.status;
      if (options.contentType) input.contentType = options.contentType;
      if (options.limit !== undefined) input.limit = pageLimit(options.limit);
      if (options.usage && !cursor) input.usage = true;

      const page = await db.listObjects(input, { signal });
      const locate = recursive
        ? locationsOf([
            ...(page.locations ?? []),
            ...(page.trail ?? []),
            ...(page.folders ?? []),
          ])
        : null;
      if (locate) {
        for (const object of page.objects) {
          locations.set(object, locate(object.folderId));
        }
      }
      return {
        items: page.objects,
        nextCursor: page.nextCursor,
        ...(page.folders && {
          folders: page.folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            ...(locate && { location: locate(folder.parentId) }),
          })),
        }),
        ...(page.trail && {
          trail: page.trail.map((folder) => ({
            id: folder.id,
            name: folder.name,
          })),
        }),
        ...(page.usage && { usage: { ...page.usage, ...page.limits } }),
        ...(page.total !== undefined && { total: page.total }),
      };
    },
  };
  if (searchBelow) source.searchScopes = ["folder", "all"];

  const updateObject = db.updateObject?.bind(db);
  if (updateObject) {
    source.renameFile = async ({ item, name }) => {
      const { object } = await updateObject({
        key: item.key,
        bucket: item.bucket,
        name,
      });
      return object;
    };
  }
  if (!folders) return source;

  source.uploadOptions = (parent) => ({
    clientMetadata: { [DB_FOLDER_ID_KEY]: parent ?? "" },
  });
  const createFolder = db.createFolder?.bind(db);
  if (createFolder) {
    source.createFolder = async ({ parent, name }) => {
      // A `/` would be a nested path. The server creates one folder.
      if (!isFolderName(name)) throw s3Error("FOLDER_INVALID");
      const { folder } = await createFolder({
        parentId: parent,
        name,
      });
      return { id: folder.id, name: folder.name };
    };
  }
  const updateFolder = db.updateFolder?.bind(db);
  if (updateFolder) {
    source.renameFolder = async ({ folder, name }) => {
      // A `/` would be a nested path. The server renames one folder.
      if (!isFolderName(name)) throw s3Error("FOLDER_INVALID");
      const { folder: updated } = await updateFolder({
        id: folder.id,
        name,
      });
      return { id: updated.id, name: updated.name };
    };
  }
  return source;
}
