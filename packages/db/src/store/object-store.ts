import { s3Error } from "@dimah-s3/core";
import type { AbstractQuery, FindManyOptions } from "fumadb/query";
import type { dbSchema } from "@/schema/schema";
import type { DbListSort, DbUsage } from "@/types/client";
import type {
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";
import {
  decodeListCursor,
  DEFAULT_LIST_SORT,
  encodeListCursor,
  type ListCursor,
  type ListCursorFilters,
} from "./list-cursor";
import { mapStorageObjectRow } from "./map-row";

/** The FumaDB ORM for the schema the stores read. */
export type DbOrm = AbstractQuery<typeof dbSchema>;

/** Resolves the ORM once the schema version is checked. */
export type GetDbOrm = () => Promise<DbOrm>;

/** Condition builder of a `storage_object` query. */
export type ObjectConditions = Parameters<
  NonNullable<
    FindManyOptions<(typeof dbSchema.tables)["storageObject"]>["where"]
  >
>[0];

type Condition = ReturnType<ObjectConditions> | boolean;

/** Rows per page when `limit` is not given. */
export const DEFAULT_LIST_LIMIT = 50;

/** Rows `findStale` returns when `limit` is not given. */
export const DEFAULT_STALE_LIMIT = 100;

/**
 * How long a purge claim holds a stale row. A row whose purge failed is
 * stale again once its claim lapses.
 */
export const PURGE_CLAIM_MS = 15 * 60_000;

/** Identifies one object row. `(bucket, key)` is unique. */
export type ObjectRef = {
  bucket: string;
  key: string;
};

/** The upload `uploadToken` started on the row at `(bucket, key)`. */
export type UploadRef = ObjectRef & { uploadToken: string };

export type UpsertPendingInput = ObjectRef & {
  scope: string;
  route: string;
  /** Folder that holds the object. `null` is the root. */
  folderId: string | null;
  filename: string;
  contentType?: string | null;
  /** Size the client declared. Quota counts it until the row expires. */
  declaredSize?: number | null;
  acl?: string | null;
  /** Multipart upload ID. */
  uploadId?: string | null;
  /** Token of the upload ticket. Confirm must present the same one. */
  uploadToken: string;
  /** Confirm deadline: the upload ticket's expiry. */
  expiresAt: Date;
  /**
   * Lets the upload replace an active object at the key. The active row
   * keeps its object fields, folder, and attributes until the upload is
   * confirmed, so the object stays listed and downloadable meanwhile.
   */
  overwrite?: boolean;
};

export type MarkActiveInput = UploadRef & {
  /** Verified size from HeadObject. */
  size: number;
  eTag?: string | null;
  contentType?: string | null;
  filename?: string;
  s3Metadata?: Record<string, string> | null;
  acl?: string | null;
};

/** Which rows of a scope a listing or count covers. */
export type ObjectFilter = {
  scope: string;
  /** Folder to cover. `null` is the root. Omit for every folder. */
  folderId?: string | null;
  /**
   * @default "active". `pending` covers only rows that have not expired.
   */
  status?: StorageObjectStatus;
  route?: string;
  /** Exact type, or `type/*` for every subtype (`image/*`). */
  contentType?: string;
  /**
   * Text the `filename` contains (`LIKE` on SQL), where `%` and `_` act as
   * wildcards. The database decides case: PostgreSQL matches it exactly,
   * SQLite ignores ASCII case, and MySQL follows the column collation.
   */
  search?: string;
};

export type ListObjectsInput = ObjectFilter & {
  /** @default { field: "createdAt", direction: "desc" } */
  sort?: DbListSort;
  /** @default 50 */
  limit?: number;
  /**
   * `nextCursor` of the previous page. A cursor made under other filters is
   * ignored, and the listing starts at the first page.
   */
  cursor?: string | null;
};

export type ListObjectsPage<TAttributes = never> = {
  objects: StorageObject<TAttributes>[];
  /** `null` on the last page. */
  nextCursor: string | null;
  /** True when the page starts the listing, including after an ignored cursor. */
  firstPage: boolean;
};

/** Fields `update` changes. Omitted fields stay as they are. */
export type UpdateObjectInput<TAttributes = never> = {
  filename?: string;
  /** Folder id. `null` moves the object to the root. */
  folderId?: string | null;
  attributes?: TAttributes | null;
};

/** Data access for the `storage_object` table. It never calls S3. */
export type StorageObjectStore<TAttributes = never> = {
  /** Loads the row at `(bucket, key)`, whatever its status. */
  find: (ref: ObjectRef) => Promise<StorageObject<TAttributes> | null>;
  /**
   * One page of a scope's rows. Pages follow a cursor, ordered by `sort`
   * with ties broken on `id`. Rows with no `size` come last.
   */
  list: (input: ListObjectsInput) => Promise<ListObjectsPage<TAttributes>>;
  /** Counts the rows a filter covers. */
  count: (filter: ObjectFilter) => Promise<number>;
  /**
   * Bytes and files of a scope: the size of each active row plus the
   * declared size of each pending row that has not expired. An active row
   * with an overwrite in flight counts the larger of the two. `excluding`
   * leaves one row out, such as the row an upload replaces.
   */
  getUsage: (
    scope: string,
    options?: { excluding?: ObjectRef },
  ) => Promise<DbUsage>;
  /**
   * Starts an upload at `(bucket, key)`: writes a fresh pending row over a
   * missing, pending, or deleted one (a deleted row is replaced by a new row
   * with a new id). With `overwrite`, an active row stays active and only
   * takes the upload's token, upload ID, declared size, and deadline. Each
   * write is a compare-and-set on the row as it was read.
   * @throws `OBJECT_EXISTS` when an active row is there and `overwrite` is
   * not set; `CONFLICT` when purge has claimed the row or a concurrent write
   * wins.
   */
  upsertPending: (
    input: UpsertPendingInput,
  ) => Promise<StorageObject<TAttributes>>;
  /**
   * Compare-and-set confirm: promotes the row only while `uploadToken`'s
   * upload is in flight on it (see {@link isUploading}). A row this upload
   * already confirmed is a replay and is returned as stored.
   * @throws `OBJECT_NOT_FOUND` when no row matches (missing, deleted,
   * purging, or taken by another upload).
   */
  markActive: (input: MarkActiveInput) => Promise<StorageObject<TAttributes>>;
  /**
   * Changes an active row. With `id` or `scope`, only that row, so a check
   * made on it still holds. Returns `null` when no row matches.
   */
  update: (
    ref: ObjectRef & { id?: string; scope?: string },
    input: UpdateObjectInput<TAttributes>,
  ) => Promise<StorageObject<TAttributes> | null>;
  /** Marks the row `deleted` and keeps it. */
  softDelete: (ref: ObjectRef) => Promise<void>;
  /** Removes the row. */
  hardDelete: (ref: ObjectRef) => Promise<void>;
  /**
   * Ends an upload that left no object, such as a multipart abort: removes
   * its pending row, or clears it from the active row it was overwriting,
   * which keeps the previous object. Rows of other uploads are left alone.
   */
  cancelUpload: (ref: UploadRef) => Promise<void>;
  /**
   * Removes the row while `uploadToken`'s upload is in flight on it, for
   * when that upload's object is gone. An overwrite's object already
   * replaced the previous one, so its active row goes too.
   */
  discardUpload: (ref: UploadRef) => Promise<void>;
  /**
   * Rows past their deadline, oldest first: pending rows, active rows whose
   * overwrite was never confirmed, and rows a failed purge left `purging`,
   * once the claim lapses.
   */
  findStale: (options?: {
    limit?: number;
  }) => Promise<StorageObject<TAttributes>[]>;
  /**
   * Exclusive compare-and-set claim for purge, while the row is still stale.
   * A pending row becomes `purging`. An active row stays active, and its
   * `uploadToken` takes the claim prefix (see {@link uploadTokenOf}).
   * Either way the upload can no longer confirm the row. The claim moves the
   * deadline {@link PURGE_CLAIM_MS} ahead, so no other run can claim the row
   * meanwhile. Returns the claimed row, or `null` when it was confirmed,
   * deleted, written again by a new upload, or claimed by another run.
   */
  claimStale: (id: string) => Promise<StorageObject<TAttributes> | null>;
  /** Removes a claimed row, only while it is still `purging`. */
  deletePurged: (id: string) => Promise<void>;
  /** Removes `deleted` rows deleted before `olderThan`. Returns how many. */
  pruneDeleted: (olderThan: Date) => Promise<number>;
};

/**
 * What purge puts in front of the `uploadToken` of an overwrite it claims.
 * The confirm presents the bare token, so it no longer matches the row.
 * Upload tokens are base64url, so they never contain `:`.
 */
const CLAIMED_TOKEN_PREFIX = "purge:";

/** The token an overwrite row takes when purge claims it. */
function claimedToken(token: string): string {
  // A lapsed claim is claimed again, and keeps its prefix.
  return token.startsWith(CLAIMED_TOKEN_PREFIX)
    ? token
    : CLAIMED_TOKEN_PREFIX + token;
}

/**
 * The token of the upload that wrote the row, also once purge has claimed
 * it. It is the value of the object's upload marker in S3.
 */
export function uploadTokenOf(object: StorageObject<unknown>) {
  const token = object.uploadToken;
  return token?.startsWith(CLAIMED_TOKEN_PREFIX)
    ? token.slice(CLAIMED_TOKEN_PREFIX.length)
    : token;
}

/**
 * True while an upload is in flight on the row: it is pending, or it is
 * active with the deadline of an overwrite that is not confirmed yet. The
 * row's `uploadToken` is that upload's, or purge's claim of it.
 */
export function isUploading(object: StorageObject<unknown>): boolean {
  return (
    object.uploadToken !== null &&
    (object.status === "pending" ||
      (object.status === "active" && object.expiresAt !== null))
  );
}

/** Active rows, and pending rows whose confirm deadline has not passed. */
export function liveObject(b: ObjectConditions, now: Date): Condition {
  return b.or(
    b("status", "=", "active"),
    b.and(b("status", "=", "pending"), b("expiresAt", ">=", now)),
  );
}

/** The condition form of {@link isUploading}, without the token. */
function uploading(b: ObjectConditions): Condition {
  return b.or(
    b("status", "=", "pending"),
    b.and(b("status", "=", "active"), b.isNotNull("expiresAt")),
  );
}

/**
 * Rows purge handles: pending rows with no deadline or one that has passed,
 * overwrites past theirs, and `purging` rows whose claim lapsed.
 */
function staleObject(b: ObjectConditions, now: Date): Condition {
  return b.or(
    b.and(
      b("status", "=", "pending"),
      b.or(b.isNull("expiresAt"), b("expiresAt", "<", now)),
    ),
    b.and(b("status", "=", "purging"), b("expiresAt", "<", now)),
    b.and(
      b("status", "=", "active"),
      b.isNotNull("uploadToken"),
      b("expiresAt", "<", now),
    ),
  );
}

function byRef(b: ObjectConditions, ref: ObjectRef): Condition {
  return b.and(b("bucket", "=", ref.bucket), b("key", "=", ref.key));
}

function byUpload(b: ObjectConditions, ref: UploadRef): Condition {
  return b.and(byRef(b, ref), b("uploadToken", "=", ref.uploadToken));
}

let lastClaimDeadline = 0;

/**
 * A claim deadline that no other claim of this process uses, so a claim can
 * tell its own write from a concurrent one. Every shipped schema keeps
 * timestamps to the millisecond.
 */
function claimDeadline(): Date {
  lastClaimDeadline = Math.max(
    Date.now() + PURGE_CLAIM_MS,
    lastClaimDeadline + 1,
  );
  return new Date(lastClaimDeadline);
}

function filterConditions(
  b: ObjectConditions,
  filter: ObjectFilter,
  now: Date,
): Condition[] {
  const status = filter.status ?? "active";
  const parts: Condition[] = [
    b("scope", "=", filter.scope),
    status === "pending"
      ? b.and(b("status", "=", "pending"), b("expiresAt", ">=", now))
      : b("status", "=", status),
  ];
  if (filter.folderId === null) parts.push(b.isNull("folderId"));
  else if (filter.folderId !== undefined) {
    parts.push(b("folderId", "=", filter.folderId));
  }
  if (filter.route) parts.push(b("route", "=", filter.route));
  if (filter.contentType?.endsWith("/*")) {
    // `image/*` keeps every `image/…` type.
    const prefix = filter.contentType.slice(0, -1);
    parts.push(b("contentType", "starts with", prefix));
  } else if (filter.contentType) {
    parts.push(b("contentType", "=", filter.contentType));
  }
  if (filter.search) parts.push(b("filename", "contains", filter.search));
  return parts;
}

/**
 * One run of a sorted listing. Rows with a value for the sort field come
 * first; for `size`, the rows without one (`nulls`) follow in `id` order.
 * Splitting the runs keeps pages stable whatever order the database gives
 * nulls.
 */
type ListSegment = { nulls: boolean; after?: ListCursor };

/** A byte count as the `bigint` columns store it. */
function toByteCount(value: number | null | undefined): bigint | null {
  return value == null ? null : BigInt(value);
}

/** A cursor's sort value as its column compares it: sizes are `bigint`. */
function toColumnValue(value: Date | number | string): Date | bigint | string {
  return typeof value === "number" ? BigInt(value) : value;
}

/** Creates the `storage_object` store over `getOrm`. */
export function createObjectStore<TAttributes = never>(
  getOrm: GetDbOrm,
): StorageObjectStore<TAttributes> {
  const map = mapStorageObjectRow<TAttributes>;

  const find = async (ref: ObjectRef) => {
    const orm = await getOrm();
    const row = await orm.findFirst("storageObject", {
      where: (b) => byRef(b, ref),
    });
    return row ? map(row) : null;
  };

  const findById = async (id: string) => {
    const orm = await getOrm();
    const row = await orm.findFirst("storageObject", {
      where: (b) => b("id", "=", id),
    });
    return row ? map(row) : null;
  };

  return {
    find,

    async list(input) {
      const orm = await getOrm();
      const now = new Date();
      const sort = input.sort ?? DEFAULT_LIST_SORT;
      const limit = input.limit ?? DEFAULT_LIST_LIMIT;
      const { field, direction } = sort;
      const after = direction === "desc" ? "<" : ">";
      // Only a pending row has no `size`; every other sort field is required.
      const nullable = field === "size";
      const filters: ListCursorFilters = {
        folderId: input.folderId,
        search: input.search || undefined,
        status: input.status ?? "active",
        route: input.route || undefined,
        contentType: input.contentType || undefined,
        sort,
      };
      const cursor = input.cursor
        ? decodeListCursor(input.cursor, filters)
        : null;

      const where =
        (segment: ListSegment) =>
        (b: ObjectConditions): Condition => {
          const parts = filterConditions(b, input, now);
          const position = segment.after;
          if (segment.nulls) {
            parts.push(b.isNull(field));
            if (position) parts.push(b("id", after, position.id));
          } else {
            if (nullable) parts.push(b.isNotNull(field));
            if (position && position.value !== null) {
              const value = toColumnValue(position.value);
              parts.push(
                b.or(
                  b(field, after, value),
                  b.and(b(field, "=", value), b("id", after, position.id)),
                ),
              );
            }
          }
          return b.and(...parts);
        };

      const findSegment = (segment: ListSegment, take: number) =>
        orm.findMany("storageObject", {
          where: where(segment),
          orderBy: segment.nulls
            ? [["id", direction]]
            : [
                [field, direction],
                ["id", direction],
              ],
          limit: take,
        });

      // One row past the page tells whether another page follows.
      const take = limit + 1;
      let rows;
      if (cursor?.value === null) {
        // The cursor row had no sort value: continue the null run.
        rows = await findSegment({ nulls: true, after: cursor }, take);
      } else {
        rows = await findSegment(
          { nulls: false, after: cursor ?? undefined },
          take,
        );
        if (nullable && rows.length < take) {
          // The sorted run ended on this page; the null run follows.
          rows.push(
            ...(await findSegment({ nulls: true }, take - rows.length)),
          );
        }
      }

      const objects = rows.slice(0, limit).map(map);
      const last = objects.at(-1);
      return {
        objects,
        nextCursor:
          rows.length > limit && last ? encodeListCursor(filters, last) : null,
        firstPage: cursor === null,
      };
    },

    async count(filter) {
      const orm = await getOrm();
      const now = new Date();
      return orm.count("storageObject", {
        where: (b) => b.and(...filterConditions(b, filter, now)),
      });
    },

    async getUsage(scope, options = {}) {
      const orm = await getOrm();
      const now = new Date();
      const rows = await orm.findMany("storageObject", {
        select: [
          "bucket",
          "key",
          "status",
          "size",
          "declaredSize",
          "expiresAt",
        ],
        where: (b) => b.and(b("scope", "=", scope), liveObject(b, now)),
      });
      const { excluding } = options;
      let totalBytes = 0;
      let objectCount = 0;
      for (const row of rows) {
        if (excluding?.bucket === row.bucket && excluding.key === row.key) {
          continue;
        }
        const size = Number(row.size ?? 0);
        const declared = Number(row.declaredSize ?? 0);
        // An overwrite in flight reserves its declared bytes until it is
        // confirmed or expires; the old bytes count until then too.
        const overwriting =
          row.status === "active" &&
          row.expiresAt !== null &&
          row.expiresAt >= now;
        totalBytes +=
          row.size === null
            ? declared
            : overwriting
              ? Math.max(size, declared)
              : size;
        objectCount += 1;
      }
      return { totalBytes, objectCount };
    },

    async upsertPending(input) {
      const ref = { bucket: input.bucket, key: input.key };
      const existing = await find(ref);
      if (existing?.status === "purging") throw s3Error("CONFLICT");
      if (existing?.status === "active" && !input.overwrite) {
        throw s3Error("OBJECT_EXISTS");
      }

      const orm = await getOrm();
      const upload = {
        uploadId: input.uploadId ?? null,
        uploadToken: input.uploadToken,
        declaredSize: toByteCount(input.declaredSize),
        expiresAt: input.expiresAt,
      };
      const now = new Date();
      const fresh = {
        ...upload,
        ...ref,
        scope: input.scope,
        route: input.route,
        folderId: input.folderId,
        filename: input.filename,
        contentType: input.contentType ?? null,
        size: null,
        eTag: null,
        status: "pending",
        s3Metadata: null,
        attributes: null,
        acl: input.acl ?? null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const create = async () => {
        try {
          await orm.create("storageObject", fresh);
        } catch (error) {
          // A concurrent upload inserted the row first.
          if (await find(ref)) throw s3Error("CONFLICT");
          throw error;
        }
      };

      if (existing === null) {
        await create();
      } else if (existing.status === "deleted") {
        // A fresh row with a fresh id: the deleted object is gone. Only one
        // caller deletes the row; the unique (bucket, key) settles the rest.
        await orm.deleteMany("storageObject", {
          where: (b) =>
            b.and(b("id", "=", existing.id), b("status", "=", "deleted")),
        });
        await create();
      } else {
        // Compare-and-set on the row as it was read: its status, scope and
        // upload token. A write that raced this one leaves no match.
        const unchanged = (b: ObjectConditions) =>
          b.and(
            byRef(b, ref),
            b("status", "=", existing.status),
            b("scope", "=", input.scope),
            existing.uploadToken === null
              ? b.isNull("uploadToken")
              : b("uploadToken", "=", existing.uploadToken),
          );
        await orm.updateMany("storageObject", {
          where: unchanged,
          // An active row stays active until the overwrite is confirmed.
          set: existing.status === "active" ? upload : fresh,
        });
      }

      const row = await find(ref);
      if (row?.uploadToken !== input.uploadToken) throw s3Error("CONFLICT");
      return row;
    },

    async markActive(input) {
      const orm = await getOrm();
      const now = new Date();
      await orm.updateMany("storageObject", {
        where: (b) => b.and(byUpload(b, input), uploading(b)),
        set: {
          status: "active",
          size: BigInt(input.size),
          declaredSize: null,
          eTag: input.eTag ?? null,
          ...(input.contentType !== undefined && {
            contentType: input.contentType,
          }),
          ...(input.filename !== undefined && { filename: input.filename }),
          ...(input.s3Metadata !== undefined && {
            s3Metadata: input.s3Metadata,
          }),
          ...(input.acl !== undefined && { acl: input.acl }),
          uploadId: null,
          expiresAt: null,
          confirmedAt: now,
          updatedAt: now,
        },
      });
      // Zero rows updated is fine when this upload already confirmed the row.
      const row = await find(input);
      if (
        row?.status === "active" &&
        row.uploadToken === input.uploadToken &&
        !isUploading(row)
      ) {
        return row;
      }
      throw s3Error("OBJECT_NOT_FOUND");
    },

    async update(ref, input) {
      const orm = await getOrm();
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(
            byRef(b, ref),
            b("status", "=", "active"),
            ref.id === undefined || b("id", "=", ref.id),
            ref.scope === undefined || b("scope", "=", ref.scope),
          ),
        set: {
          ...(input.filename !== undefined && { filename: input.filename }),
          ...(input.folderId !== undefined && { folderId: input.folderId }),
          ...(input.attributes !== undefined && {
            attributes: input.attributes,
          }),
          updatedAt: new Date(),
        },
      });
      const row = await find(ref);
      if (row?.status !== "active") return null;
      if (ref.id !== undefined && row.id !== ref.id) return null;
      return ref.scope === undefined || row.scope === ref.scope ? row : null;
    },

    async softDelete(ref) {
      const orm = await getOrm();
      const now = new Date();
      await orm.updateMany("storageObject", {
        where: (b) => b.and(byRef(b, ref), b("status", "!=", "deleted")),
        set: { status: "deleted", deletedAt: now, updatedAt: now },
      });
    },

    async hardDelete(ref) {
      const orm = await getOrm();
      await orm.deleteMany("storageObject", { where: (b) => byRef(b, ref) });
    },

    async cancelUpload(ref) {
      const orm = await getOrm();
      await orm.deleteMany("storageObject", {
        where: (b) => b.and(byUpload(b, ref), b("status", "=", "pending")),
      });
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(
            byUpload(b, ref),
            b("status", "=", "active"),
            b.isNotNull("expiresAt"),
          ),
        set: {
          uploadId: null,
          uploadToken: null,
          declaredSize: null,
          expiresAt: null,
        },
      });
    },

    async discardUpload(ref) {
      const orm = await getOrm();
      await orm.deleteMany("storageObject", {
        where: (b) => b.and(byUpload(b, ref), uploading(b)),
      });
    },

    async findStale(options = {}) {
      const orm = await getOrm();
      const now = new Date();
      const rows = await orm.findMany("storageObject", {
        where: (b) => staleObject(b, now),
        // A lapsed claim's deadline is its claim time plus the lease, so a
        // row that keeps failing queues behind the rows that expired before.
        orderBy: [
          ["expiresAt", "asc"],
          ["id", "asc"],
        ],
        limit: options.limit ?? DEFAULT_STALE_LIMIT,
      });
      return rows.map(map);
    },

    async claimStale(id) {
      const orm = await getOrm();
      const now = new Date();
      const deadline = claimDeadline();
      const stale = (b: ObjectConditions) =>
        b.and(b("id", "=", id), staleObject(b, now));
      const current = await findById(id);
      if (!current) return null;
      if (current.status === "active") {
        const token = current.uploadToken;
        if (token === null) return null;
        // The row keeps its status, and the `updatedAt` listings sort on.
        // Its token moves aside, so the overwrite cannot confirm it. Matching
        // on the token leaves a row that a new upload took meanwhile alone.
        await orm.updateMany("storageObject", {
          where: (b) =>
            b.and(
              stale(b),
              b("status", "=", "active"),
              b("uploadToken", "=", token),
            ),
          set: { expiresAt: deadline, uploadToken: claimedToken(token) },
        });
      } else {
        await orm.updateMany("storageObject", {
          where: (b) =>
            b.and(stale(b), b("status", "in", ["pending", "purging"])),
          set: { status: "purging", expiresAt: deadline, updatedAt: now },
        });
      }
      const row = await findById(id);
      return row?.expiresAt?.getTime() === deadline.getTime() ? row : null;
    },

    async deletePurged(id) {
      const orm = await getOrm();
      await orm.deleteMany("storageObject", {
        where: (b) => b.and(b("id", "=", id), b("status", "=", "purging")),
      });
    },

    async pruneDeleted(olderThan) {
      const orm = await getOrm();
      const where = (b: ObjectConditions) =>
        b.and(b("status", "=", "deleted"), b("deletedAt", "<", olderThan));
      const pruned = await orm.count("storageObject", { where });
      if (pruned > 0) await orm.deleteMany("storageObject", { where });
      return pruned;
    },
  };
}
