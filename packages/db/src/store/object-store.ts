import { s3Error } from "@dimah-s3/core";
import type { AbstractQuery, FindManyOptions } from "fumadb/query";
import type { v2 } from "@/schema/v2";
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

/** The FumaDB ORM for schema 2.0.0. */
export type DbOrm = AbstractQuery<typeof v2>;

/** Resolves the ORM once the schema version is checked. */
export type GetDbOrm = () => Promise<DbOrm>;

/** Condition builder of a `storage_object` query. */
export type ObjectConditions = Parameters<
  NonNullable<FindManyOptions<(typeof v2.tables)["storageObject"]>["where"]>
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
  /** Logical folder. `null` is the root. */
  folder: string | null;
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
  folder?: string | null;
  /**
   * @default "active". `pending` covers only rows that have not expired.
   */
  status?: StorageObjectStatus;
  route?: string;
  contentType?: string;
  /**
   * Text the `filename` contains (`LIKE` on SQL). Case follows the database
   * collation, and `%` and `_` act as wildcards.
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
  /** Folder path. `null` is the root. */
  folder?: string | null;
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
   * declared size of each pending row that has not expired. `excluding`
   * leaves one row out, such as the row an upload replaces.
   */
  getUsage: (
    scope: string,
    options?: { excluding?: ObjectRef },
  ) => Promise<DbUsage>;
  /**
   * Starts an upload at `(bucket, key)`: writes a fresh pending row over a
   * missing, pending, or deleted one. With `overwrite`, an active row stays
   * active and only takes the upload's token, upload ID, declared size,
   * and deadline. Each write is a compare-and-set on the row's status.
   * @throws `CONFLICT` when an active row is there and `overwrite` is not
   * set, when purge has claimed the row, or when a concurrent write wins.
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
  /** Changes an active row. Returns `null` when there is none. */
  update: (
    ref: ObjectRef,
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
   * A pending row becomes `purging`; an active row stays active. The claim
   * moves the deadline {@link PURGE_CLAIM_MS} ahead, so no other run can
   * claim the row meanwhile. Returns the claimed row, or `null` when it was
   * confirmed, deleted, written again by a new upload, or claimed by
   * another run.
   */
  claimStale: (id: string) => Promise<StorageObject<TAttributes> | null>;
  /** Removes a claimed row, only while it is still `purging`. */
  deletePurged: (id: string) => Promise<void>;
  /** Removes `deleted` rows deleted before `olderThan`. Returns how many. */
  pruneDeleted: (olderThan: Date) => Promise<number>;
};

/**
 * True while an upload is in flight on the row: it is pending, or it is
 * active with the deadline of an overwrite that is not confirmed yet. The
 * row's `uploadToken` is that upload's.
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
 * Rows purge handles: pending rows past their deadline (a 1.x row may have
 * none), overwrites past theirs, and `purging` rows whose claim lapsed.
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
  if (filter.folder === null) parts.push(b.isNull("folder"));
  else if (filter.folder !== undefined) {
    parts.push(b("folder", "=", filter.folder));
  }
  if (filter.route) parts.push(b("route", "=", filter.route));
  if (filter.contentType) {
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
        folder: input.folder,
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
              parts.push(
                b.or(
                  b(field, after, position.value),
                  b.and(
                    b(field, "=", position.value),
                    b("id", after, position.id),
                  ),
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
        select: ["bucket", "key", "size", "declaredSize"],
        where: (b) => b.and(b("scope", "=", scope), liveObject(b, now)),
      });
      const { excluding } = options;
      let totalBytes = 0;
      let objectCount = 0;
      for (const row of rows) {
        if (excluding?.bucket === row.bucket && excluding.key === row.key) {
          continue;
        }
        totalBytes += Number(row.size ?? row.declaredSize ?? 0);
        objectCount += 1;
      }
      return { totalBytes, objectCount };
    },

    async upsertPending(input) {
      const ref = { bucket: input.bucket, key: input.key };
      const existing = await find(ref);
      if (existing?.status === "purging") throw s3Error("CONFLICT");
      if (existing?.status === "active" && !input.overwrite) {
        throw s3Error("CONFLICT");
      }

      const orm = await getOrm();
      const sameScope = (b: ObjectConditions) => b("scope", "=", input.scope);
      const upload = {
        uploadId: input.uploadId ?? null,
        uploadToken: input.uploadToken,
        declaredSize: input.declaredSize ?? null,
        expiresAt: input.expiresAt,
      };
      const now = new Date();
      const fresh = {
        ...upload,
        scope: input.scope,
        route: input.route,
        folder: input.folder,
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

      if (existing?.status === "active") {
        // The object stays active until the overwrite is confirmed.
        await orm.updateMany("storageObject", {
          where: (b) =>
            b.and(byRef(b, ref), b("status", "=", "active"), sameScope(b)),
          set: upload,
        });
      } else if (existing) {
        await orm.updateMany("storageObject", {
          where: (b) =>
            b.and(
              byRef(b, ref),
              b.or(
                b("status", "=", "deleted"),
                b.and(b("status", "=", "pending"), sameScope(b)),
              ),
            ),
          set: fresh,
        });
      } else {
        try {
          await orm.create("storageObject", { ...fresh, ...ref });
        } catch (error) {
          // A concurrent upload inserted the row first.
          if (await find(ref)) throw s3Error("CONFLICT");
          throw error;
        }
      }

      // A write that lost a race to a confirm, purge, or upload matched nothing.
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
          size: input.size,
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
        where: (b) => b.and(byRef(b, ref), b("status", "=", "active")),
        set: {
          ...(input.filename !== undefined && { filename: input.filename }),
          ...(input.folder !== undefined && { folder: input.folder }),
          ...(input.attributes !== undefined && {
            attributes: input.attributes,
          }),
          updatedAt: new Date(),
        },
      });
      const row = await find(ref);
      return row?.status === "active" ? row : null;
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
      await orm.updateMany("storageObject", {
        where: (b) =>
          b.and(stale(b), b("status", "in", ["pending", "purging"])),
        set: { status: "purging", expiresAt: deadline, updatedAt: now },
      });
      // An active row keeps its status, and the `updatedAt` listings sort on.
      await orm.updateMany("storageObject", {
        where: (b) => b.and(stale(b), b("status", "=", "active")),
        set: { expiresAt: deadline },
      });
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
