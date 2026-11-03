import { pluginPath, s3Error } from "@dimah-s3/core";
import type { DimahS3Config } from "@dimah-s3/server";
import { createS3Endpoint } from "@dimah-s3/server/plugins";
import { childFolderPath } from "@/folder-path";
import { formatStandardIssue, validateStandardSchema } from "@/standard-schema";
import type { DbStore } from "@/store/create-db-store";
import type {
  DbClientFolder,
  DbClientListResponse,
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

/** The child folders whose name contains the search text, ignoring case. */
function matchingFolders(
  children: readonly StorageFolder[],
  search: string | undefined,
): readonly StorageFolder[] {
  if (!search) return children;
  const text = search.toLowerCase();
  return children.filter((child) => child.name.toLowerCase().includes(text));
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
): Pick<AccessTarget, "folder" | "folderId"> {
  if (folder === null) return { folder: null, folderId: null };
  return { folder: folder.path, folderId: folder.id };
}

/**
 * The `db` plugin's HTTP endpoints. Each one resolves the caller's scope and
 * runs `authorize` before it reads or writes a row:
 *
 * - `GET /db/objects` (op `list`): one page of the scope's objects. The
 *   first page also carries usage, the quota, the child folders (those
 *   whose name contains `search`, when it is set), and the breadcrumb trail.
 * - `GET /db/object` (op `read`): one object.
 * - `PATCH /db/object` (op `update`): renames, moves, or sets attributes.
 * - `POST /db/folder`, `PATCH /db/folder`, and `DELETE /db/folder`
 *   (op `update`): create a folder, rename or move it, or remove an empty one.
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
      async (ctx): Promise<DbClientListResponse<TClientAttributes>> => {
        const { folderId: wireFolder, ...filters } = ctx.query;
        const peeked = await resolveScope(ctx.context, {
          operation: "list",
          route: filters.route,
        });
        const opened = await openFolder(peeked.scope, wireFolder);
        const scope = await access.scope(ctx.context, {
          operation: "list",
          route: filters.route,
          ...(opened !== undefined && folderTarget(opened)),
        });
        const page = await objects.list({
          ...filters,
          scope: scope.scope,
          folderId: opened === undefined ? undefined : (opened?.id ?? null),
        });
        const response: DbClientListResponse<TClientAttributes> = {
          objects: page.objects.map((object) => toClientObject(object)),
          nextCursor: page.nextCursor,
        };
        if (!page.firstPage) return response;

        const [usage, limits, children, trail] = await Promise.all([
          objects.getUsage(scope.scope),
          quota.limits(scope),
          opened === undefined
            ? undefined
            : folders.children(scope.scope, opened?.id ?? null),
          opened === undefined
            ? undefined
            : opened === null
              ? []
              : folders.trail(scope.scope, opened.id),
        ]);
        return {
          ...response,
          usage,
          limits,
          ...(children && {
            folders: matchingFolders(children, filters.search).map(
              toDbClientFolder,
            ),
          }),
          ...(trail && { trail: trail.map(toDbClientFolder) }),
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
     * requires the target folder to exist and authorizes that folder.
     */
    updateObject: createS3Endpoint(
      pluginPath("db", "object"),
      { method: "PATCH", body: dbUpdateObjectBodySchema },
      async (ctx): Promise<{ object: DbClientObject<TClientAttributes> }> => {
        const { key, filename } = ctx.body;
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
            ...(opened !== undefined && folderTarget(opened)),
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
          filename === undefined &&
          folderId === undefined &&
          attributes === undefined
        ) {
          return { object: toClientObject(object) };
        }

        // Pinned to the row that was checked, so a key another scope took
        // over in between is left alone.
        const updated = await options.objects.update(
          { bucket, key, id: object.id, scope: scope.scope },
          { filename, folderId, attributes },
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
        const peeked = await resolveScope(ctx.context, { operation: "update" });
        const parent =
          parentId === null ? null : await openFolder(peeked.scope, parentId);
        const path = childFolderPath(parent?.path ?? null, ctx.body.name);
        if (path === null) throw s3Error("FOLDER_INVALID");
        const scope = await access.scope(ctx.context, {
          operation: "update",
          folder: path,
        });
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
        const peeked = await resolveScope(ctx.context, { operation: "update" });
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
          operation: "update",
          folder: path,
          folderId: current.id,
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
        const peeked = await resolveScope(ctx.context, { operation: "update" });
        const current = await folders.find(peeked.scope, ctx.query.id);
        if (!current) return { id: ctx.query.id };
        await access.scope(ctx.context, {
          operation: "update",
          ...folderTarget(current),
        });
        await folders.delete(peeked.scope, current.id);
        return { id: current.id };
      },
    ),
  };
}
