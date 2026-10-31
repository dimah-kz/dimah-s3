import { s3Error } from "@dimah-s3/core";
import { formatFolder, joinFolderPath } from "@/folder-path";
import type {
  DbClientActions,
  DbClientListInput,
  DbClientObject,
  DbListSort,
  DbListSortField,
  DbObjectSource,
  DbObjectSourceFile,
  DbObjectSourceOptions,
  DbObjectSourceQueryInput,
} from "@/types/client";

/** The `api.db` actions {@link dbObjectSource} calls. */
export type DbObjectSourceActions<TClientAttributes = never> = Pick<
  DbClientActions<TClientAttributes>,
  "listObjects"
> &
  Partial<Pick<DbClientActions<TClientAttributes>, "createFolder">>;

/** List sort fields and the `listObjects` columns they order by. */
const SORT_FIELDS = new Map<string, DbListSortField>([
  ["name", "filename"],
  ["size", "size"],
  ["updatedAt", "updatedAt"],
]);

function toListSort(
  sort: DbObjectSourceQueryInput["sort"],
): DbListSort | undefined {
  const field = sort ? SORT_FIELDS.get(sort.field) : undefined;
  return sort && field ? { field, direction: sort.direction } : undefined;
}

function toFile(object: DbClientObject<unknown>): DbObjectSourceFile {
  return {
    name: object.filename,
    objectKey: object.key,
    size: object.size,
    contentType: object.contentType,
    updatedAt: object.updatedAt,
  };
}

/**
 * A `useObjectList` source over `api.db`.
 *
 * With `folders` on (the default), `parent` is a folder path: each page
 * lists one folder, the first page carries its child folders, uploads go to
 * the open folder, and "New folder" calls `api.db.createFolder`. With
 * `folders: false`, the list is flat and has no folder actions.
 *
 * `search` matches the filename on the server. `sort` maps `name` to
 * `filename`; `size` and `updatedAt` keep their names, and other fields keep
 * the server's order (newest first). `usage` is the scope total with its
 * caps, not the open folder's.
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

  const source: DbObjectSource<TClientAttributes> = {
    getKey: (item) => item.id,
    getFile: toFile,
    async query({ parent, cursor, sort, search, signal }) {
      const input: DbClientListInput = {};
      if (folders) input.folder = formatFolder(parent);
      if (cursor) input.cursor = cursor;
      if (search) input.search = search;
      const listSort = toListSort(sort);
      if (listSort) input.sort = listSort;
      if (options.route) input.route = options.route;
      if (options.status) input.status = options.status;
      if (options.contentType) input.contentType = options.contentType;
      if (options.limit !== undefined) input.limit = options.limit;

      const page = await db.listObjects(input, { signal });
      return {
        items: page.objects,
        nextCursor: page.nextCursor,
        ...(page.folders && {
          folders: page.folders.map((folder) => ({
            id: folder.path,
            name: folder.name,
          })),
        }),
        ...(page.usage && { usage: { ...page.usage, ...page.limits } }),
      };
    },
  };
  if (!folders) return source;

  source.uploadOptions = (parent) => ({
    metadata: { folder: formatFolder(parent) },
  });
  const createFolder = db.createFolder?.bind(db);
  if (createFolder) {
    source.createFolder = async ({ parent, name }) => {
      // A `/` would create a nested folder instead of a child of `parent`.
      if (name.includes("/")) throw s3Error("FOLDER_INVALID");
      const { folder } = await createFolder({
        path: joinFolderPath(parent, name),
      });
      return { id: folder.path, name: folder.name };
    };
  }
  return source;
}
