import type { InferFumaDB } from "fumadb";
import type { DimahS3DB } from "@/fuma-db";
import { conflict, notFound } from "@/errors";
import type {
  DbListSort,
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";
import { mapStorageObjectRow } from "./map-row";
import {
  decodeListCursor,
  DEFAULT_LIST_SORT,
  type ListCursor,
} from "./list-cursor";

/** FumaDB uses `false` as a type-level sentinel for invalid operators. */
function condition<T>(value: T): Exclude<T, boolean> {
  if (typeof value === "boolean") {
    throw new TypeError("[dimah-s3/db] invalid query condition");
  }
  return value as Exclude<T, boolean>;
}

/** FumaDB client for the @dimah-s3/db schema. */
export type DimahS3DbClient = InferFumaDB<typeof DimahS3DB>;

/** `where` callback for `storage_object` (FumaDB does not export the builder type). */
type StorageObjectWhere = NonNullable<
  NonNullable<
    Parameters<ReturnType<DimahS3DbClient["orm"]>["count"]>[1]
  >["where"]
>;

/**
 * One run of a sorted listing. Rows with a value for the sort field come
 * first; for a nullable field, the rows without one (`nulls`) follow in `id`
 * order. Splitting the runs keeps pages stable whatever order the database
 * gives nulls.
 */
type ListSegment = { nulls: boolean; after?: ListCursor };

/** A cursor value as the column stores it (`size` is a bigint). */
function toColumnValue(value: Date | number | string): Date | bigint | string {
  return typeof value === "number" ? BigInt(value) : value;
}

/** Identifies one object row — `(bucket, key)` is unique. */
export type ObjectRef = {
  bucket: string;
  key: string;
};

export type UpsertPendingInput = ObjectRef & {
  scope: string;
  route: string;
  contentType?: string | null;
  /** Client-declared size in bytes (quota reservation — not verified). */
  declaredSize?: number | null;
  metadata?: Record<string, unknown> | null;
  acl?: string | null;
  filename?: string | null;
  /** Multipart upload ID, when the pending upload is multipart. */
  uploadId?: string | null;
  /** Pending TTL — stale rows past this are eligible for purge. */
  expiresAt?: Date | null;
};

export type MarkActiveInput = ObjectRef & {
  /** Verified size in bytes (from HeadObject). */
  size: number;
  eTag?: string | null;
  contentType?: string | null;
  acl?: string | null;
  filename?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ListByScopeInput = {
  scope: string;
  /**
   * Filter by exact status. When omitted, only `active` rows are returned.
   */
  status?: StorageObjectStatus;
  route?: string;
  contentType?: string;
  /** Key prefix. Applied in the query (`starts with`), so pages stay full. */
  prefix?: string;
  /**
   * Text the `filename` contains (`LIKE` on SQL). Case follows the database
   * collation; with Drizzle and Kysely, `%` and `_` act as wildcards.
   */
  search?: string;
  /** @default { field: "createdAt", direction: "desc" } */
  sort?: DbListSort;
  limit?: number;
  offset?: number;
  /** From `encodeListCursor` under the same `sort`. Another sort's cursor is ignored. */
  cursor?: string;
};

export type ScopeUsage = {
  /** Sum of verified size (fallback: declared size) of non-deleted rows. */
  totalBytes: number;
  /** Non-deleted row count. */
  objectCount: number;
};

/**
 * Minimal multipart resume payload — structurally matches
 * `@dimah-s3/react` `StoredUpload` so a custom client `UploadStore` can
 * return it from `get()` without importing react types.
 */
export type PendingMultipartResume = {
  uploadId: string;
  key: string;
  /** Declared file size in bytes (must match the File being resumed). */
  fileSize: number;
  bucket: string;
};

export type FindPendingMultipartInput = ObjectRef & {
  /** Must equal the pending row's `declaredSize`. */
  fileSize: number;
};

/**
 * Map a `storage_object` row to a client resume payload.
 * Returns `null` unless the row is `pending` with `uploadId` and `declaredSize`.
 */
export function toPendingMultipartResume(
  object: StorageObject,
): PendingMultipartResume | null {
  if (
    object.status !== "pending" ||
    object.uploadId == null ||
    object.declaredSize == null
  ) {
    return null;
  }
  return {
    uploadId: object.uploadId,
    key: object.key,
    fileSize: object.declaredSize,
    bucket: object.bucket,
  };
}

/** Data-access layer for the `storage_object` table. */
export type StorageObjectStore = {
  /**
   * Insert or reset a row to `pending` (presign / multipart init).
   * Returns the written row.
   */
  upsertPending: (input: UpsertPendingInput) => Promise<StorageObject>;
  /**
   * Promote a pending row to `active` with verified fields (confirm / complete).
   * Also refreshes an already-active row (overwrite). Returns the active row.
   */
  markActive: (input: MarkActiveInput) => Promise<StorageObject>;
  /** Load one row by `bucket` + `key` (any status). */
  find: (ref: ObjectRef) => Promise<StorageObject | null>;
  /** Load one row by scope + key (any status). */
  findByScopeKey: (input: {
    scope: string;
    key: string;
    bucket?: string;
  }) => Promise<StorageObject | null>;
  /** Load one row — only when `status` is `active`. */
  findActive: (ref: ObjectRef) => Promise<StorageObject | null>;
  /**
   * Pending multipart row for resume: `pending` + `uploadId` + matching
   * `declaredSize`. Returns the full row so callers can enforce scope.
   */
  findPendingMultipart: (
    input: FindPendingMultipartInput,
  ) => Promise<StorageObject | null>;
  /**
   * List rows for a scope (pass `scope` explicitly — admin routes, jobs, etc.).
   * Defaults to `active`. Server-side listing; browser apps use
   * `api.db.listObjects` instead (scope from `resolveScope`, no HTTP from server code).
   */
  listByScope: (input: ListByScopeInput) => Promise<StorageObject[]>;
  /** Total bytes and row count for a scope — quota checks (`pending` uses `declaredSize`). */
  getScopeUsage: (scope: string) => Promise<ScopeUsage>;
  /** Row count for a scope; optional `status` filter (same defaults as `listByScope`). */
  countByScope: (
    scope: string,
    status?: StorageObjectStatus,
  ) => Promise<number>;
  /**
   * Mark a row `deleted` (keeps the record). DB-only — does not delete from S3.
   * Not a substitute for `api.delete`; the plugin calls this from `onDeleted`
   * when `deleteMode` is `"soft"`.
   */
  softDelete: (ref: ObjectRef) => Promise<void>;
  /**
   * Remove the row entirely. DB-only — does not delete from S3.
   * Not a substitute for `api.delete`; used by the plugin when `deleteMode` is
   * `"hard"`, or by admin jobs to prune soft-deleted audit rows.
   */
  hardDelete: (ref: ObjectRef) => Promise<void>;
  /** Remove a `pending` row (multipart abort path). Optional `uploadId` must match. */
  deletePending: (ref: ObjectRef & { uploadId?: string }) => Promise<void>;
  /** Pending rows past `expiresAt`, or with no TTL and `createdAt` before `olderThan`. */
  findStalePending: (input: { olderThan: Date }) => Promise<StorageObject[]>;
  /** Delete rows by ID (used by the purge job after `findStalePending`). */
  deleteByIds: (ids: string[]) => Promise<void>;
};

function toBigInt(value: number | null | undefined): bigint | null {
  return value === null || value === undefined
    ? null
    : BigInt(Math.trunc(value));
}

function confirmedFields(input: MarkActiveInput, now: Date) {
  return {
    size: toBigInt(input.size),
    eTag: input.eTag ?? null,
    ...(input.contentType !== undefined && {
      contentType: input.contentType,
    }),
    ...(input.acl !== undefined && { acl: input.acl }),
    ...(input.filename !== undefined && { filename: input.filename }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
    uploadId: null,
    declaredSize: null,
    expiresAt: null,
    confirmedAt: now,
    updatedAt: now,
  };
}

function toActiveObject(
  existing: StorageObject,
  input: MarkActiveInput,
  now: Date,
): StorageObject {
  return {
    ...existing,
    status: "active",
    size: input.size,
    eTag: input.eTag ?? null,
    contentType:
      input.contentType !== undefined
        ? input.contentType
        : existing.contentType,
    acl: input.acl !== undefined ? input.acl : existing.acl,
    filename: input.filename !== undefined ? input.filename : existing.filename,
    metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
    uploadId: null,
    declaredSize: null,
    expiresAt: null,
    confirmedAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Create a store bound to schema v1 (`db.orm("1.0.0")`). */
export function createStorageObjectStore(
  db: DimahS3DbClient,
): StorageObjectStore {
  const orm = db.orm("1.0.0");

  const store: StorageObjectStore = {
    async upsertPending(input) {
      const now = new Date();
      const pendingFields = {
        scope: input.scope,
        route: input.route,
        contentType: input.contentType ?? null,
        declaredSize: toBigInt(input.declaredSize),
        metadata: input.metadata ?? null,
        acl: input.acl ?? null,
        filename: input.filename ?? null,
        uploadId: input.uploadId ?? null,
        expiresAt: input.expiresAt ?? null,
        status: "pending" as const,
        size: null,
        eTag: null,
        confirmedAt: null,
        deletedAt: null,
      };
      const row = await orm
        .upsert("storageObject", {
          where: (b) =>
            b.and(b("bucket", "=", input.bucket), b("key", "=", input.key)),
          update: { ...pendingFields, updatedAt: now },
          create: {
            ...pendingFields,
            bucket: input.bucket,
            key: input.key,
            updatedAt: now,
          },
        })
        .forceReturning();
      return mapStorageObjectRow(row);
    },

    async markActive(input) {
      const existing = await store.find(input);
      if (!existing || existing.status === "deleted") {
        throw notFound("No pending object to confirm");
      }
      const now = new Date();
      const fields = confirmedFields(input, now);
      if (existing.status === "active") {
        await orm.updateMany("storageObject", {
          where: (b) =>
            b.and(
              b("bucket", "=", input.bucket),
              b("key", "=", input.key),
              b("status", "=", "active"),
            ),
          set: fields,
        });
        return toActiveObject(existing, input, now);
      }
      if (existing.status !== "pending") {
        throw conflict("Object is not pending confirmation");
      }
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(
            b("bucket", "=", input.bucket),
            b("key", "=", input.key),
            b("status", "=", "pending"),
          ),
        set: {
          status: "active" as const,
          ...fields,
          deletedAt: null,
        },
      });
      return toActiveObject(existing, input, now);
    },

    async find(ref) {
      const row = await orm.findFirst("storageObject", {
        where: (b) =>
          b.and(b("bucket", "=", ref.bucket), b("key", "=", ref.key)),
      });
      return row ? mapStorageObjectRow(row) : null;
    },

    async findByScopeKey(input) {
      const row = await orm.findFirst("storageObject", {
        where: (b) => {
          const parts = [
            b("scope", "=", input.scope),
            b("key", "=", input.key),
          ];
          if (input.bucket) {
            parts.push(b("bucket", "=", input.bucket));
          }
          return b.and(...parts);
        },
      });
      return row ? mapStorageObjectRow(row) : null;
    },

    async findActive(ref) {
      const row = await orm.findFirst("storageObject", {
        where: (b) =>
          b.and(
            b("bucket", "=", ref.bucket),
            b("key", "=", ref.key),
            b("status", "=", "active"),
          ),
      });
      return row ? mapStorageObjectRow(row) : null;
    },

    async findPendingMultipart(input) {
      const row = await orm.findFirst("storageObject", {
        where: (b) =>
          b.and(
            b("bucket", "=", input.bucket),
            b("key", "=", input.key),
            b("status", "=", "pending"),
            b.isNotNull("uploadId"),
            b("declaredSize", "=", BigInt(Math.trunc(input.fileSize))),
          ),
      });
      return row ? mapStorageObjectRow(row) : null;
    },

    async listByScope(input) {
      const status = input.status ?? "active";
      const sort = input.sort ?? DEFAULT_LIST_SORT;
      const { field, direction } = sort;
      const after = direction === "desc" ? "<" : ">";
      // `createdAt` is never null; `size` (pending rows) and `filename` can be.
      const nullable = field !== "createdAt";
      const cursor = input.cursor ? decodeListCursor(input.cursor, sort) : null;
      const { limit } = input;

      const where =
        (segment: ListSegment): StorageObjectWhere =>
        (b) => {
          const parts = [
            b("scope", "=", input.scope),
            b("status", "=", status),
          ];
          if (input.route) parts.push(b("route", "=", input.route));
          if (input.contentType) {
            parts.push(b("contentType", "=", input.contentType));
          }
          if (input.prefix) {
            parts.push(b("key", "starts with", input.prefix));
          }
          if (input.search) {
            parts.push(b("filename", "contains", input.search));
          }
          if (segment.nulls) {
            parts.push(b.isNull(field));
            if (segment.after) parts.push(b("id", after, segment.after.id));
          } else {
            if (nullable) parts.push(b.isNotNull(field));
            const value = segment.after?.value;
            if (segment.after && value != null) {
              const at = toColumnValue(value);
              parts.push(
                condition(
                  b.or(
                    b(field, after, at),
                    condition(
                      b.and(
                        b(field, "=", at),
                        b("id", after, segment.after.id),
                      ),
                    ),
                  ),
                ),
              );
            }
          }
          return b.and(...parts);
        };

      const find = (segment: ListSegment, take?: number, offset?: number) =>
        orm.findMany("storageObject", {
          where: where(segment),
          orderBy: segment.nulls
            ? [["id", direction]]
            : [
                [field, direction],
                ["id", direction],
              ],
          limit: take,
          offset,
        });

      if (cursor?.value === null) {
        // The cursor row had no sort value: continue the null run.
        const rows = await find({ nulls: true, after: cursor }, limit);
        return rows.map(mapStorageObjectRow);
      }

      const offset = cursor ? undefined : input.offset;
      const rows = await find(
        { nulls: false, after: cursor ?? undefined },
        limit,
        offset,
      );
      if (nullable && (limit === undefined || rows.length < limit)) {
        // The sorted run ended on this page; the null run follows.
        let tailOffset: number | undefined;
        if (offset && rows.length === 0) {
          const sorted = await orm.count("storageObject", {
            where: where({ nulls: false }),
          });
          tailOffset = Math.max(0, offset - sorted);
        }
        const tail = await find(
          { nulls: true },
          limit === undefined ? undefined : limit - rows.length,
          tailOffset,
        );
        rows.push(...tail);
      }
      return rows.map(mapStorageObjectRow);
    },

    async getScopeUsage(scope) {
      const rows = await orm.findMany("storageObject", {
        select: ["size", "declaredSize"],
        where: (b) =>
          b.and(b("scope", "=", scope), b("status", "!=", "deleted")),
      });
      let totalBytes = 0;
      for (const row of rows) {
        totalBytes += Number(row.size ?? row.declaredSize ?? 0n);
      }
      return { totalBytes, objectCount: rows.length };
    },

    async countByScope(scope, status = "active") {
      return orm.count("storageObject", {
        where: (b) => b.and(b("scope", "=", scope), b("status", "=", status)),
      });
    },

    async softDelete(ref) {
      const now = new Date();
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(b("bucket", "=", ref.bucket), b("key", "=", ref.key)),
        set: { status: "deleted", deletedAt: now, updatedAt: now },
      });
    },

    async hardDelete(ref) {
      await orm.deleteMany("storageObject", {
        where: (b) =>
          b.and(b("bucket", "=", ref.bucket), b("key", "=", ref.key)),
      });
    },

    async deletePending(ref) {
      await orm.deleteMany("storageObject", {
        where: (b) => {
          if (ref.uploadId != null) {
            return b.and(
              b("bucket", "=", ref.bucket),
              b("key", "=", ref.key),
              b("status", "=", "pending"),
              b("uploadId", "=", ref.uploadId),
            );
          }
          return b.and(
            b("bucket", "=", ref.bucket),
            b("key", "=", ref.key),
            b("status", "=", "pending"),
          );
        },
      });
    },

    async findStalePending({ olderThan }) {
      const now = new Date();
      const rows = await orm.findMany("storageObject", {
        where: (b) =>
          b.and(
            b("status", "=", "pending"),
            b.or(
              b("expiresAt", "<", now),
              condition(
                b.and(b.isNull("expiresAt"), b("createdAt", "<", olderThan)),
              ),
            ),
          ),
        orderBy: ["createdAt", "asc"],
      });
      return rows.map(mapStorageObjectRow);
    },

    async deleteByIds(ids) {
      if (ids.length === 0) return;
      await orm.deleteMany("storageObject", {
        where: (b) => b("id", "in", ids),
      });
    },
  };

  return store;
}
