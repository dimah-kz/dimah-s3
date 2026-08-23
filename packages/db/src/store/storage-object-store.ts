import type { InferFumaDB } from "fumadb";
import type { DimahS3DB } from "@/fuma-db";
import type {
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";
import { mapStorageObjectRow } from "./map-row";

/** FumaDB client for the @dimah-s3/db schema. */
export type DimahS3DbClient = InferFumaDB<typeof DimahS3DB>;

/** Identifies one object row — `(bucket, key)` is unique. */
export type ObjectRef = {
  bucket: string;
  key: string;
};

export type UpsertPendingInput = ObjectRef & {
  scope: string;
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
   * Filter by exact status. When omitted, soft-deleted rows are excluded
   * and pending + active rows are returned.
   */
  status?: StorageObjectStatus;
  limit?: number;
  offset?: number;
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
  /** Insert or reset a row to `pending` (presign / multipart init). */
  upsertPending: (input: UpsertPendingInput) => Promise<void>;
  /** Promote a row to `active` with verified fields (confirm / complete). */
  markActive: (input: MarkActiveInput) => Promise<void>;
  /** Load one row by `bucket` + `key` (any status). */
  find: (ref: ObjectRef) => Promise<StorageObject | null>;
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
   * Skips `deleted` by default. Server-side listing; browser apps use
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
  /** Remove a `pending` row (multipart abort path). */
  deletePending: (ref: ObjectRef) => Promise<void>;
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
      await orm.upsert("storageObject", {
        where: (b) =>
          b.and(b("bucket", "=", input.bucket), b("key", "=", input.key)),
        update: { ...pendingFields, updatedAt: now },
        create: {
          ...pendingFields,
          bucket: input.bucket,
          key: input.key,
        },
      });
    },

    async markActive(input) {
      const now = new Date();
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(
            b("bucket", "=", input.bucket),
            b("key", "=", input.key),
            b("status", "!=", "deleted"),
          ),
        set: {
          status: "active",
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
          deletedAt: null,
          updatedAt: now,
        },
      });
    },

    async find(ref) {
      const row = await orm.findFirst("storageObject", {
        where: (b) =>
          b.and(b("bucket", "=", ref.bucket), b("key", "=", ref.key)),
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
      const object = await store.find({
        bucket: input.bucket,
        key: input.key,
      });
      if (
        !object ||
        object.status !== "pending" ||
        object.uploadId == null ||
        object.declaredSize !== input.fileSize
      ) {
        return null;
      }
      return object;
    },

    async listByScope(input) {
      const rows = await orm.findMany("storageObject", {
        where: (b) =>
          b.and(
            b("scope", "=", input.scope),
            input.status
              ? b("status", "=", input.status)
              : b("status", "!=", "deleted"),
          ),
        orderBy: ["createdAt", "desc"],
        limit: input.limit,
        offset: input.offset,
      });
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

    async countByScope(scope, status) {
      return orm.count("storageObject", {
        where: (b) =>
          b.and(
            b("scope", "=", scope),
            status ? b("status", "=", status) : b("status", "!=", "deleted"),
          ),
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
        where: (b) =>
          b.and(
            b("bucket", "=", ref.bucket),
            b("key", "=", ref.key),
            b("status", "=", "pending"),
          ),
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
              b.and(b.isNull("expiresAt"), b("createdAt", "<", olderThan)),
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
