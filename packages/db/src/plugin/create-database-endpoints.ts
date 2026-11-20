import { matchesSearchText, pluginPath, s3Error } from "@dimah-s3/core";
import type { DimahS3Config } from "@dimah-s3/server";
import { createS3Endpoint } from "@dimah-s3/server/plugins";
import { childFolderPath } from "@/folder-path";
import { formatStandardIssue, validateStandardSchema } from "@/standard-schema";
import type { DbStore } from "@/store/create-db-store";
import type {
  DbClientFolder,
  DbClientListObjectsResponse,
  DbClientObject,
} from "@/types/client";
import type { DbAttributesOptions } from "@/types/plugin";
import type { StorageFolder, StorageObject } from "@/types/storage-object";
import type { AccessTarget, ObjectAccess } from "./object-access";
import type { DbObjects } from "./public-stores";
import type { Quota } from "./quota";
import type { ScopeResolver } from "./scope";
import {
  dbCreateFolderBodySchema,
  dbDeleteFolderQuerySchema,
  dbListQuerySchema,
  dbObjectQuerySchema,
  dbUpdateFolderBodySchema,
  dbUpdateObjectBodySchema,
} from "./schemas";
import { toDbClientFolder } from "./to-db-client-object";

/** Largest JSON size of stored attributes when `maxBytes` is not set. */
export const DEFAULT_ATTRIBUTES_MAX_BYTES = 16_384;

export type CreateDatabaseEndpointsOptions<
  TSession,
  TAttributes,
  TClientAttributes,
> = {
  store: Pick<DbStore<TAttributes>, "objects" | "folders">;
  /** The public object store, whose `update` checks the folder and retains it. */
  objects: Pick<DbObjects<TAttributes>, "update">;
  access: ObjectAccess<TSession, TAttributes>;
  resolveScope: ScopeResolver<TSession>;
  quota: Pick<Quota<TSession>, "limits">;
  /** The plugin's `attributes` option. Without it, PATCH refuses `attributes`. */
  attributes?: DbAttributesOptions<TAttributes, TClientAttributes>;
  toClientObject: (
    object: StorageObject<TAttributes>,
  ) => DbClientObject<TClientAttributes>;
};

const utf8 = new TextEncoder();

/**
 * The bucket a call targets: `bucket` when a route uses it, or the only
 * bucket the routes use when it is omitted.
 * @throws `VALIDATION_ERROR` for another bucket, or when `bucket` is
 * omitted and the routes use several.
 */
function resolveBucket(
  config: Readonly<DimahS3Config>,
  bucket: string | undefined,
  field: string,
): string {
  const buckets = new Set<string>();
  for (const route of Object.values(config.routes)) {
    const routeBucket = route.bucket ?? config.bucket;
    if (routeBucket) buckets.add(routeBucket);
  }
  if (bucket === undefined) {
    const [only] = buckets;
    if (only !== undefined && buckets.size === 1) return only;
    throw s3Error("VALIDATION_ERROR", {
      issue: `[${field}] Required when the routes use several buckets`,
    });
  }
  if (!buckets.has(bucket)) {
    throw s3Error("VALIDATION_ERROR", {
      issue: `[${field}] No route uses this bucket`,
    });
  }
  return bucket;
}

/**
 * The child folders whose name contains the search text, folded the way
 * file search folds it.
 */
function matchingFolders(
  children: readonly StorageFolder[],
  search: string | undefined,
): readonly StorageFolder[] {
  if (!search) return children;
  return children.filter((child) => matchesSearchText(child.name, search));
}

/** `""` and `null` are the root. `undefined` means the field was omitted. */
function wireFolderId(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" || value === null ? null : value;
}

/** What `authorize` sees for one folder. `null` is the root. */
function folderTarget(
  folder: StorageFolder | null,
): Required<Pick<AccessTarget, "folder" | "folderId">> {
  if (folder === null) return { folder: null, folderId: null };
  return { folder: folder.path, folderId: folder.id };
}

/**
 * The `db` plugin's HTTP endpoints. Each one resolves the caller's scope and
 * runs `authorize` before it reads or writes a row:
 *
 * - `GET /db/objects` (op `list`): one page of the scope's objects, from
 *   one folder or, with `recursive`, from it and every folder below. The
 *   first page also carries the quota, the usage (when there is a quota or
 *   the query asks), the folders (those whose name contains `search`, when
 *   it is set), the breadcrumb trail, and a search's `total`. A recursive
 *   page carries the `locations` of its rows. A flat listing covers every
 *   folder, so `authorize` sees it as a recursive listing of the root.
 * - `GET /db/object` (op `read`): one object.
 * - `PATCH /db/object` (op `update`): renames, moves, or sets attributes.
 * - `POST /db/folder` (op `folder.create`), `PATCH /db/folder` (op
 *   `folder.update`), and `DELETE /db/folder` (op `folder.delete`): create
 *   a folder, rename or move it, or remove an empty one.
 */
export function createDatabaseEndpoints<
  TSession,
  TAttributes,
  TClientAttributes,
>(
  options: CreateDatabaseEndpointsOptions<
    TSession,
    TAttributes,
    TClientAttributes
  >,
) {
  const { access, quota, resolveScope, toClientObject } = options;
  const { objects, folders } = options.store;

  /**
   * Validates PATCH `attributes` with the plugin's schema.
   * @throws `VALIDATION_ERROR` when attributes are not enabled, fail the
   * schema, or are larger than `maxBytes` as JSON.
   */
  const parseAttributes = async (
    value: Record<string, unknown>,
  ): Promise<TAttributes> => {
    const { attributes } = options;
    if (!attributes) {
      throw s3Error("VALIDATION_ERROR", {
        issue: "[body.attributes] Attributes are not enabled",
      });
    }
    const result = await validateStandardSchema(attributes.schema, value);
    if (result.issues) {
      throw s3Error("VALIDATION_ERROR", {
        issue: `[body.attributes] ${formatStandardIssue(result.issues)}`,
      });
    }
    const maxBytes = attributes.maxBytes ?? DEFAULT_ATTRIBUTES_MAX_BYTES;
    const size = utf8.encode(JSON.stringify(result.value)).byteLength;
    if (size > maxBytes) {
      throw s3Error("VALIDATION_ERROR", {
        issue: `[body.attributes] Exceeds ${maxBytes} bytes`,
      });
    }
    return result.value;
  };

  /**
   * The folder a listing opens, after the scope is known.
   * `undefined` is a flat list. `null` is the root.
   */
  const openFolder = async (scope: string, wire: string | undefined) => {
    const folderId = wireFolderId(wire);
    if (folderId === undefined) return undefined;
    if (folderId === null) return null;
    const folder = await folders.find(scope, folderId);
    if (!folder) throw s3Error("FOLDER_NOT_FOUND");
    return folder;
  };

  return {
    /** One page of the caller's objects. `folderId` omitted lists every folder. */
    objects: createS3Endpoint(
      pluginPath("db", "objects"),
      { method: "GET", query: dbListQuerySchema },
      async (ctx): Promise<DbClientListObjectsResponse<TClientAttributes>> => {
        const {
          folderId: wireFolder,
          recursive: wantsSubtree,
          usage: wantsUsage,
          ...filters
        } = ctx.query;
        const peeked = await resolveScope(ctx.context, {
          operation: "list",
          route: filters.route,
        });
        const opened = await openFolder(peeked.scope, wireFolder);
        // A flat listing already covers every folder.
        const recursive = wantsSubtree === true && opened !== undefined;
        const scope = await access.scope(ctx.context, {
          operation: "list",
          route: filters.route,
          // A flat listing reads what a recursive listing of the root reads.
          ...(opened === undefined
            ? { folder: null, folderId: null, recursive: true }
            : { ...folderTarget(opened), ...(recursive && { recursive }) }),
        });
        const folderId =
          opened === undefined ? undefined : (opened?.id ?? null);
        const filter = { ...filters, folderId, recursive };
        /** The caps, and the usage when there are caps or the query asks. */
        const usageAndLimits = async () => {
          const limits = await quota.limits(scope);
          const usage =
            limits !== null || wantsUsage === true
              ? await objects.usage(scope.scope)
              : undefined;
          return { usage, limits };
        };
        const firstPage = () =>
          Promise.all([
            usageAndLimits(),
            opened === undefined
              ? undefined
              : recursive
                ? folders.descendants(scope.scope, folderId ?? null, {
                    search: filters.search,
                  })
                : folders
                    .children(scope.scope, folderId ?? null)
                    .then((children) =>
                      matchingFolders(children, filters.search),
                    ),
            opened === undefined
              ? undefined
              : opened === null
                ? []
                : folders.trail(scope.scope, opened.id),
            filters.search ? objects.count(scope.scope, filter) : undefined,
          ]);
        // Without a cursor this is the first page: its extras load beside
        // it and share its walk below the folder.
        const early = filters.cursor ? null : firstPage();
        early?.catch(() => undefined);
        const page = await objects.list(scope.scope, filter);
        const response: DbClientListObjectsResponse<TClientAttributes> = {
          objects: page.objects.map((object) => toClientObject(object)),
          nextCursor: page.nextCursor,
        };
        /** Folders whose location this page draws. */
        const located = page.objects.flatMap((object) =>
          object.folderId === null ? [] : [object.folderId],
        );
        if (!page.firstPage) {
          if (!recursive) return response;
          const locations = await folders.ancestors(scope.scope, located);
          return { ...response, locations: locations.map(toDbClientFolder) };
        }

        const [{ usage, limits }, listed, trail, total] = await (early ??
          firstPage());
        const locations = recursive
          ? await folders.ancestors(scope.scope, [
              ...located,
              ...(listed ?? []).flatMap((folder) =>
                folder.parentId === null ? [] : [folder.parentId],
              ),
            ])
          : undefined;
        return {
          ...response,
          ...(usage && { usage }),
          limits,
          ...(listed && { folders: listed.map(toDbClientFolder) }),
          ...(trail && { trail: trail.map(toDbClientFolder) }),
          ...(locations && { locations: locations.map(toDbClientFolder) }),
          ...(total !== undefined && { total }),
        };
      },
    ),

    /** One object of the caller's scope. */
    object: createS3Endpoint(
      pluginPath("db", "object"),
      { method: "GET", query: dbObjectQuerySchema },
      async (ctx): Promise<{ object: DbClientObject<TClientAttributes> }> => {
        const { key } = ctx.query;
        const bucket = resolveBucket(
          ctx.context.config,
          ctx.query.bucket,
          "query.bucket",
        );
        const { object } = await access.object(
          ctx.context,
          { operation: "read", key },
          { bucket, key },
        );
        if (object.status === "purging") throw s3Error("OBJECT_NOT_FOUND");
        return { object: toClientObject(object) };
      },
    ),

    /**
     * Renames, moves, or sets the attributes of an active object. A move
     * requires the target folder to exist; `authorize` sees it as the
     * `destination`, next to the folder the object is in.
     */
    updateObject: createS3Endpoint(
      pluginPath("db", "object"),
      { method: "PATCH", body: dbUpdateObjectBodySchema },
      async (ctx): Promise<{ object: DbClientObject<TClientAttributes> }> => {
        const { key, name } = ctx.body;
        const bucket = resolveBucket(
          ctx.context.config,
          ctx.body.bucket,
          "body.bucket",
        );
        const folderId = wireFolderId(ctx.body.folderId);
        const peeked = await resolveScope(ctx.context, {
          operation: "update",
        });
        const opened =
          folderId === undefined
            ? undefined
            : await openFolder(peeked.scope, folderId ?? "");

        // Access first: a caller without it never reaches your schema.
        const { scope, object } = await access.object(
          ctx.context,
          {
            operation: "update",
            key,
            ...(opened !== undefined && { destination: folderTarget(opened) }),
          },
          { bucket, key },
        );
        if (object.status !== "active") throw s3Error("OBJECT_NOT_FOUND");
        // `null` clears the attributes without the schema.
        const attributes =
          ctx.body.attributes === undefined || ctx.body.attributes === null
            ? ctx.body.attributes
            : await parseAttributes(ctx.body.attributes);
        if (
          name === undefined &&
          folderId === undefined &&
          attributes === undefined
        ) {
          return { object: toClientObject(object) };
        }

        // Pinned to the row that was checked, so a key another scope took
        // over in between is left alone.
        const updated = await options.objects.update(
          { bucket, key, id: object.id, scope: scope.scope },
          { name, folderId, attributes },
        );
        if (!updated) throw s3Error("OBJECT_NOT_FOUND");
        return { object: toClientObject(updated) };
      },
    ),

    /** Creates one folder inside a parent that already exists. */
    createFolder: createS3Endpoint(
      pluginPath("db", "folder"),
      { method: "POST", body: dbCreateFolderBodySchema },
      async (ctx): Promise<{ folder: DbClientFolder }> => {
        const parentId = wireFolderId(ctx.body.parentId) ?? null;
        const peeked = await resolveScope(ctx.context, {
          operation: "folder.create",
        });
        const parent =
          parentId === null ? null : await openFolder(peeked.scope, parentId);
        const path = childFolderPath(parent?.path ?? null, ctx.body.name);
        if (path === null) throw s3Error("FOLDER_INVALID");
        const scope = await access.scope(ctx.context, {
          operation: "folder.create",
          // The folder it goes into, and where it will be.
          ...folderTarget(parent ?? null),
          destination: { folder: path, folderId: parentId },
        });
        const caps = await quota.limits(scope);
        if (
          caps?.maxFolders !== undefined &&
          (await folders.count(scope.scope)) >= caps.maxFolders
        ) {
          throw s3Error("QUOTA_EXCEEDED", { limit: "folders" });
        }
        const folder = await folders.create(scope.scope, {
          parentId,
          name: ctx.body.name,
        });
        return { folder: toDbClientFolder(folder) };
      },
    ),

    /** Renames a folder, moves it, or both. */
    updateFolder: createS3Endpoint(
      pluginPath("db", "folder"),
      { method: "PATCH", body: dbUpdateFolderBodySchema },
      async (ctx): Promise<{ folder: DbClientFolder }> => {
        const peeked = await resolveScope(ctx.context, {
          operation: "folder.update",
        });
        const current = await folders.find(peeked.scope, ctx.body.id);
        if (!current) throw s3Error("FOLDER_NOT_FOUND");
        const parentId =
          ctx.body.parentId === undefined
            ? current.parentId
            : (wireFolderId(ctx.body.parentId) ?? null);
        const parent =
          parentId === null ? null : await openFolder(peeked.scope, parentId);
        const path = childFolderPath(
          parent?.path ?? null,
          ctx.body.name ?? current.name,
        );
        if (path === null) throw s3Error("FOLDER_INVALID");
        await access.scope(ctx.context, {
          operation: "folder.update",
          // The folder as it is, and where the call puts it.
          ...folderTarget(current),
          destination: { folder: path, folderId: parentId },
        });
        const folder = await folders.update(peeked.scope, current.id, {
          ...(ctx.body.name !== undefined && { name: ctx.body.name }),
          ...(ctx.body.parentId !== undefined && { parentId }),
        });
        return { folder: toDbClientFolder(folder) };
      },
    ),

    /** Removes an empty folder. A missing folder is not an error. */
    deleteFolder: createS3Endpoint(
      pluginPath("db", "folder"),
      { method: "DELETE", query: dbDeleteFolderQuerySchema },
      async (ctx): Promise<{ id: string }> => {
        const peeked = await resolveScope(ctx.context, {
          operation: "folder.delete",
        });
        const current = await folders.find(peeked.scope, ctx.query.id);
        if (!current) return { id: ctx.query.id };
        await access.scope(ctx.context, {
          operation: "folder.delete",
          ...folderTarget(current),
        });
        await folders.delete(peeked.scope, current.id);
        return { id: current.id };
      },
    ),
  };
}
