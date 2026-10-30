import { fileNameFromKey } from "@dimah-s3/core";
import type {
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
  StorageObjectStatus,
} from "@/types/storage-object";

/** `listObjects` plus an optional abort signal. Matches `dbClient()`. */
export type DbObjectListSource = (
  input?: DbClientListInput,
  init?: { signal?: AbortSignal },
) => Promise<DbClientListResponse>;

/** Filters sent with every page. */
export type DbObjectSourceOptions = {
  route?: string;
  status?: StorageObjectStatus;
  contentType?: string;
  /** Rows per page. The server caps it at 100. */
  limit?: number;
};

/** The `useObjectList` query input this source reads. */
export type DbObjectQueryInput = {
  parent: string | null;
  cursor: string | null;
  signal: AbortSignal;
};

export type DbObjectQueryPage = {
  items: DbClientObject[];
  nextCursor: string | null;
  /** Scope totals from `listObjects`. Not limited to the open folder. */
  usage: DbClientListResponse["usage"];
};

/** How `ObjectList` reads a `listObjects` row. Matches `ObjectListFile`. */
export type DbObjectFile = {
  /** Filename, or the last segment of the key. */
  name: string;
  objectKey: string;
  /** Verified size. `null` while the object is still pending. */
  size: number | null;
  contentType: string | null;
  /** When the row was created. */
  updatedAt: string;
};

/** A `useObjectList` source. Matches `ObjectListSource<DbClientObject>`. */
export type DbObjectSource = {
  query: (input: DbObjectQueryInput) => Promise<DbObjectQueryPage>;
  /** Row id. */
  getKey: (object: DbClientObject) => string;
  getFile: (object: DbClientObject) => DbObjectFile;
};

/** Read a `listObjects` row as an `ObjectList` file. */
export function dbObjectFile(object: DbClientObject): DbObjectFile {
  return {
    name: object.filename || fileNameFromKey(object.key) || object.key,
    objectKey: object.key,
    size: object.size,
    contentType: object.contentType,
    updatedAt: object.createdAt,
  };
}

/**
 * A `useObjectList` source over `api.db.listObjects`.
 *
 * `parent` is sent as the key `prefix`. This does not invent folder rows:
 * default object keys contain a uuid segment, so a delimiter over the key
 * is not a folder tree. The list endpoint does not sort or search, so the
 * query ignores both. `usage` is the scope total, not the open folder.
 *
 * ```ts
 * const list = useObjectList({
 *   ...dbObjectSource(api.db.listObjects, { route: "docs" }),
 *   queryKey: ["docs"],
 * });
 * ```
 */
export function dbObjectSource(
  listObjects: DbObjectListSource,
  options?: DbObjectSourceOptions,
): DbObjectSource {
  return {
    getKey: (object) => object.id,
    getFile: dbObjectFile,
    async query(input) {
      const queryInput: DbClientListInput = {};
      if (input.parent) queryInput.prefix = input.parent;
      if (input.cursor) queryInput.cursor = input.cursor;
      if (options?.route) queryInput.route = options.route;
      if (options?.status) queryInput.status = options.status;
      if (options?.contentType) queryInput.contentType = options.contentType;
      if (options?.limit != null) queryInput.limit = options.limit;

      const page = await listObjects(queryInput, { signal: input.signal });
      return {
        items: page.objects,
        nextCursor: page.nextCursor ?? null,
        usage: page.usage,
      };
    },
  };
}
