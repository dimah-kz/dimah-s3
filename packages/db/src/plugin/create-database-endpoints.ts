import { pluginPath, s3Error } from "@dimah-s3/core";
import type { DimahS3Config } from "@dimah-s3/server";
import { createS3Endpoint } from "@dimah-s3/server/plugins";
import { parseFolder } from "@/folder-path";
import { formatStandardIssue, validateStandardSchema } from "@/standard-schema";
import type { DbStore } from "@/store/create-db-store";
import type {
  DbClientFolder,
  DbClientListResponse,
  DbClientObject,
} from "@/types/client";
import type { DbAttributesOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import type { ObjectAccess } from "./object-access";
import type { Quota } from "./quota";
import {
  dbFolderInputSchema,
  dbListQuerySchema,
  dbObjectQuerySchema,
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
  access: ObjectAccess<TSession, TAttributes>;
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
 * Reads the wire path of a folder endpoint. The root is not a folder.
 * @throws `FOLDER_INVALID`.
 */
function parseFolderPath(value: string): string {
  const path = parseFolder(value);
  if (path === null) throw s3Error("FOLDER_INVALID");
  return path;
}

/**
 * The `db` plugin's HTTP endpoints. Each one resolves the caller's scope and
 * runs `authorize` before it reads or writes a row:
 *
 * - `GET /db/objects` (op `list`): one page of the scope's objects. The
 *   first page also carries usage, the quota, and the child folders.
 * - `GET /db/object` (op `read`): one object.
 * - `PATCH /db/object` (op `update`): renames, moves, or sets attributes.
 * - `POST /db/folder` and `DELETE /db/folder` (op `update`): creates or
 *   removes an empty folder.
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
  const { access, quota, toClientObject } = options;
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

  return {
    /** One page of the caller's objects. `folder` omitted lists every folder. */
    objects: createS3Endpoint(
      pluginPath("db", "objects"),
      { method: "GET", query: dbListQuerySchema },
      async (ctx): Promise<DbClientListResponse<TClientAttributes>> => {
        const { folder: wireFolder, ...filters } = ctx.query;
        const folder =
          wireFolder === undefined ? undefined : parseFolder(wireFolder);
        const scope = await access.scope(ctx.context, {
          operation: "list",
          route: filters.route,
          ...(folder !== undefined && { folder }),
        });
        const page = await objects.list({
          ...filters,
          scope: scope.scope,
          folder,
        });
        const response: DbClientListResponse<TClientAttributes> = {
          scope: scope.scope,
          objects: page.objects.map((object) => toClientObject(object)),
          nextCursor: page.nextCursor,
        };
        if (!page.firstPage) return response;

        const [usage, limits, children] = await Promise.all([
          objects.getUsage(scope.scope),
          quota.limits(scope),
          folder === undefined
            ? undefined
            : folders.children(scope.scope, folder),
        ]);
        return {
          ...response,
          usage,
          limits,
          ...(children && { folders: children.map(toDbClientFolder) }),
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
     * checks the target folder like an upload: validated, authorized, and
     * created when missing.
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
        const folder =
          ctx.body.folder === undefined
            ? undefined
            : parseFolder(ctx.body.folder ?? "");
        const attributes =
          ctx.body.attributes === undefined
            ? undefined
            : await parseAttributes(ctx.body.attributes);

        const { scope, object } = await access.object(
          ctx.context,
          {
            operation: "update",
            key,
            ...(folder !== undefined && { folder }),
          },
          { bucket, key },
        );
        if (object.status !== "active") throw s3Error("OBJECT_NOT_FOUND");
        if (
          filename === undefined &&
          folder === undefined &&
          attributes === undefined
        ) {
          return { object: toClientObject(object) };
        }

        const updated = await objects.update(
          { bucket, key },
          { filename, folder, attributes },
        );
        if (!updated) throw s3Error("OBJECT_NOT_FOUND");
        // After the move: a folder delete in between sees the row or is undone.
        if (folder !== undefined) await folders.ensure(scope.scope, folder);
        return { object: toClientObject(updated) };
      },
    ),

    /** Creates a folder and its missing ancestors. */
    createFolder: createS3Endpoint(
      pluginPath("db", "folder"),
      { method: "POST", body: dbFolderInputSchema },
      async (ctx): Promise<{ folder: DbClientFolder }> => {
        const path = parseFolderPath(ctx.body.path);
        const scope = await access.scope(ctx.context, {
          operation: "update",
          folder: path,
        });
        const folder = await folders.create(scope.scope, path);
        return { folder: toDbClientFolder(folder) };
      },
    ),

    /** Removes an empty folder. A missing folder is not an error. */
    deleteFolder: createS3Endpoint(
      pluginPath("db", "folder"),
      { method: "DELETE", query: dbFolderInputSchema },
      async (ctx): Promise<{ path: string }> => {
        const path = parseFolderPath(ctx.query.path);
        const scope = await access.scope(ctx.context, {
          operation: "update",
          folder: path,
        });
        await folders.delete(scope.scope, path);
        return { path };
      },
    ),
  };
}
