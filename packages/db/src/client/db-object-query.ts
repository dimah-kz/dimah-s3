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

export type DbObjectQueryOptions = {
  route?: string;
  status?: StorageObjectStatus;
  contentType?: string;
  limit?: number;
};

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

/**
 * Adapt `api.db.listObjects` to a `useObjectList` query.
 *
 * `parent` is sent as the key `prefix`. This does not invent folder rows:
 * default object keys contain a uuid segment, so a delimiter over the key
 * is not a folder tree. Return `folders` from your own query when the
 * catalog has them. `usage` is the scope total from `listObjects`, not the
 * open folder.
 *
 * ```ts
 * const list = useObjectList({
 *   query: dbObjectQuery(api.db.listObjects, { route: "docs" }),
 *   queryKey: ["docs"],
 * });
 * ```
 */
export function dbObjectQuery(
  listObjects: DbObjectListSource,
  options?: DbObjectQueryOptions,
) {
  return async function query(
    input: DbObjectQueryInput,
  ): Promise<DbObjectQueryPage> {
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
  };
}
