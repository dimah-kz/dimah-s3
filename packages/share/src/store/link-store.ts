import { base64UrlDecode, base64UrlEncode, s3Error } from "@dimah-s3/core";
import { UniqueConstraintError } from "fumadb";
import {
  increment,
  type AbstractQuery,
  type FindManyOptions,
} from "fumadb/query";
import { SHARE_ERROR_CODES } from "@/error-codes";
import { SHARE_LIST_DEFAULT_LIMIT } from "@/constants";
import type { shareSchema } from "@/schema/schema";
import {
  shareLinkStatus,
  type ShareLink,
  type ShareLinkStatus,
  type ShareLinkTarget,
} from "@/types/link";

/** The FumaDB ORM for the share schema. */
export type ShareOrm = AbstractQuery<typeof shareSchema>;

/** Resolves the ORM once the schema version is checked. */
export type GetShareOrm = () => Promise<ShareOrm>;

type LinkConditions = Parameters<
  NonNullable<
    FindManyOptions<(typeof shareSchema.tables)["shareLink"]>["where"]
  >
>[0];

type Condition = ReturnType<LinkConditions> | boolean;

/** Rows one `prune` or `listOld` query reads at a time. */
const BATCH_SIZE = 500;

/** A `share_link` row inside the plugin: a {@link ShareLink} and its password hash. */
export type ShareLinkRecord = ShareLink & {
  passwordHash: string | null;
};

/** Raw `share_link` row as the FumaDB ORM returns it. */
type ShareLinkRow = {
  id: string;
  token: string;
  scope: string;
  targetType: string;
  objectId: string | null;
  folderId: string | null;
  label: string | null;
  passwordHash: string | null;
  expiresAt: Date | null;
  maxDownloads: number | bigint | null;
  downloadCount: number | bigint;
  viewCount: number | bigint;
  lastAccessedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What {@link ShareLinkStore.create} writes. */
export type CreateLinkInput = {
  token: string;
  scope: string;
  target: ShareLinkTarget;
  label: string | null;
  passwordHash: string | null;
  expiresAt: Date | null;
  maxDownloads: number | null;
};

/** Fields {@link ShareLinkStore.update} changes. Omitted fields stay. */
export type UpdateLinkInput = {
  label?: string | null;
  passwordHash?: string | null;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
};

/** Which links of a scope a listing covers. */
export type LinkFilter = {
  /** Only links to this `storage_object` id. */
  objectId?: string;
  /** Only links to this `storage_folder` id. */
  folderId?: string;
  /** Also list revoked links. Ignored with `status`. @default false */
  includeRevoked?: boolean;
  /**
   * Only links in this status or these statuses, at the time of the call,
   * the way `shareLinkStatus` tells them apart. Takes precedence over
   * `includeRevoked`.
   */
  status?: ShareLinkStatus | readonly ShareLinkStatus[];
};

export type ListLinksInput = LinkFilter & {
  /** @default 50 */
  limit?: number;
  /** `nextCursor` of the previous page. An unreadable cursor starts over. */
  cursor?: string | null;
};

export type ListLinksPage = {
  /** Newest first. */
  links: ShareLinkRecord[];
  /** `null` on the last page. */
  nextCursor: string | null;
};

/** Data access for the `share_link` table. */
export type ShareLinkStore = {
  findById: (id: string) => Promise<ShareLinkRecord | null>;
  findByToken: (token: string) => Promise<ShareLinkRecord | null>;
  /** One page of a scope's links, newest first. */
  list: (scope: string, input?: ListLinksInput) => Promise<ListLinksPage>;
  count: (scope: string, filter?: LinkFilter) => Promise<number>;
  /** Writes a new link. A token that is already taken throws `CONFLICT`. */
  create: (input: CreateLinkInput) => Promise<ShareLinkRecord>;
  /** Changes a link that is not revoked. Returns `null` when none matches. */
  update: (
    id: string,
    input: UpdateLinkInput,
  ) => Promise<ShareLinkRecord | null>;
  /**
   * Turns a link off. Returns the row, also when it was already revoked,
   * and `revoked: true` only for the one call that turned it off. `null`
   * when there is no such link.
   */
  revoke: (
    id: string,
  ) => Promise<{ record: ShareLinkRecord; revoked: boolean } | null>;
  /**
   * Counts one download in one statement, while the link is not revoked,
   * has not expired, and is under `maxDownloads`, so concurrent downloads
   * are all counted and never pass the limit. Returns the row after it.
   * @throws `SHARE_LINK_REVOKED`, `SHARE_LINK_EXPIRED`, or
   * `SHARE_LINK_EXHAUSTED` for the state that kept it from counting,
   * `SHARE_LINK_NOT_FOUND` when the row is gone, or `CONFLICT` when the
   * link changed back meanwhile.
   */
  countDownload: (link: ShareLinkRecord) => Promise<ShareLinkRecord>;
  /** Counts one view. Concurrent views are all counted. */
  countView: (link: ShareLinkRecord) => Promise<void>;
  /** Revokes every live link to one object or folder. Returns how many. */
  revokeTarget: (target: ShareLinkTarget) => Promise<number>;
  /**
   * Removes links revoked or expired before `olderThan`. Returns how many.
   */
  prune: (olderThan: Date) => Promise<number>;
  /**
   * One batch of live links of every scope created before `olderThan`, by
   * `id`, after the link `after`. For jobs that check each link's target.
   */
  listOld: (
    olderThan: Date,
    after: string | null,
  ) => Promise<ShareLinkRecord[]>;
  /** Removes these links. Returns how many were there. */
  deleteMany: (ids: readonly string[]) => Promise<number>;
};

function toNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function mapRow(row: ShareLinkRow): ShareLinkRecord {
  const target: ShareLinkTarget =
    row.targetType === "folder"
      ? { type: "folder", folderId: row.folderId ?? "" }
      : { type: "object", objectId: row.objectId ?? "" };
  return {
    id: row.id,
    token: row.token,
    scope: row.scope,
    target,
    label: row.label,
    passwordProtected: row.passwordHash !== null,
    passwordHash: row.passwordHash,
    expiresAt: row.expiresAt,
    maxDownloads: row.maxDownloads === null ? null : toNumber(row.maxDownloads),
    downloadCount: toNumber(row.downloadCount),
    viewCount: toNumber(row.viewCount),
    lastAccessedAt: row.lastAccessedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The position after one row: its `createdAt` and `id`. */
type LinkCursor = { createdAt: Date; id: string };

function encodeCursor(cursor: LinkCursor): string {
  return base64UrlEncode(
    JSON.stringify({ c: cursor.createdAt.getTime(), i: cursor.id }),
  );
}

function decodeCursor(value: string): LinkCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(value)),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "c" in parsed &&
      "i" in parsed &&
      typeof parsed.c === "number" &&
      Number.isFinite(parsed.c) &&
      typeof parsed.i === "string"
    ) {
      return { createdAt: new Date(parsed.c), id: parsed.i };
    }
  } catch {
    // An unreadable cursor starts the listing over.
  }
  return null;
}

/**
 * The rows `shareLinkStatus` gives `status` at `now`, in its order: revoked
 * wins over expired, and expired over exhausted. Each case spells out its
 * nulls, since SQL's `NOT` of a comparison with a null is unknown.
 */
function statusCondition(
  b: LinkConditions,
  status: ShareLinkStatus,
  now: Date,
): Condition {
  if (status === "revoked") return b.isNotNull("revokedAt");
  const open = b.or(b.isNull("expiresAt"), b("expiresAt", ">", now));
  switch (status) {
    case "expired":
      return b.and(
        b.isNull("revokedAt"),
        b.isNotNull("expiresAt"),
        b("expiresAt", "<=", now),
      );
    case "exhausted":
      return b.and(
        b.isNull("revokedAt"),
        open,
        b.isNotNull("maxDownloads"),
        b("downloadCount", ">=", b.ref("maxDownloads")),
      );
    case "active":
      return b.and(
        b.isNull("revokedAt"),
        open,
        b.or(
          b.isNull("maxDownloads"),
          b("downloadCount", "<", b.ref("maxDownloads")),
        ),
      );
  }
}

/** Creates the `share_link` store over `getOrm`. */
export function createLinkStore(getOrm: GetShareOrm): ShareLinkStore {
  const findById = async (id: string) => {
    const orm = await getOrm();
    const row = await orm.findFirst("shareLink", {
      where: (b) => b("id", "=", id),
    });
    return row ? mapRow(row) : null;
  };

  const deleteMany = async (ids: readonly string[]) => {
    if (ids.length === 0) return 0;
    const orm = await getOrm();
    const { count } = await orm.deleteMany("shareLink", {
      where: (b) => b("id", "in", [...ids]),
    });
    return count;
  };

  const filterConditions = (
    b: LinkConditions,
    scope: string,
    filter: LinkFilter,
    now: Date,
  ): Condition[] => {
    const parts: Condition[] = [b("scope", "=", scope)];
    if (filter.objectId !== undefined) {
      parts.push(b("targetType", "=", "object"));
      parts.push(b("objectId", "=", filter.objectId));
    }
    if (filter.folderId !== undefined) {
      parts.push(b("targetType", "=", "folder"));
      parts.push(b("folderId", "=", filter.folderId));
    }
    if (filter.status !== undefined) {
      const statuses: readonly ShareLinkStatus[] =
        typeof filter.status === "string" ? [filter.status] : filter.status;
      parts.push(
        statuses.length === 0
          ? false
          : b.or(...statuses.map((status) => statusCondition(b, status, now))),
      );
    } else if (filter.includeRevoked !== true) {
      parts.push(b.isNull("revokedAt"));
    }
    return parts;
  };

  return {
    findById,

    async findByToken(token) {
      const orm = await getOrm();
      const row = await orm.findFirst("shareLink", {
        where: (b) => b("token", "=", token),
      });
      return row ? mapRow(row) : null;
    },

    async list(scope, input = {}) {
      const orm = await getOrm();
      const limit = input.limit ?? SHARE_LIST_DEFAULT_LIMIT;
      const cursor = input.cursor ? decodeCursor(input.cursor) : null;
      const now = new Date();
      const rows = await orm.findMany("shareLink", {
        where: (b) => {
          const parts = filterConditions(b, scope, input, now);
          if (cursor) {
            parts.push(
              b.or(
                b("createdAt", "<", cursor.createdAt),
                b.and(
                  b("createdAt", "=", cursor.createdAt),
                  b("id", "<", cursor.id),
                ),
              ),
            );
          }
          return b.and(...parts);
        },
        orderBy: [
          ["createdAt", "desc"],
          ["id", "desc"],
        ],
        // One extra row tells whether another page follows.
        limit: limit + 1,
      });
      const links = rows.slice(0, limit).map(mapRow);
      const last = links.at(-1);
      return {
        links,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      };
    },

    async count(scope, filter = {}) {
      const orm = await getOrm();
      const now = new Date();
      return orm.count("shareLink", {
        where: (b) => b.and(...filterConditions(b, scope, filter, now)),
      });
    },

    async create(input) {
      const orm = await getOrm();
      const now = new Date();
      try {
        const row = await orm.create("shareLink", {
          token: input.token,
          scope: input.scope,
          targetType: input.target.type,
          objectId:
            input.target.type === "object" ? input.target.objectId : null,
          folderId:
            input.target.type === "folder" ? input.target.folderId : null,
          label: input.label,
          passwordHash: input.passwordHash,
          expiresAt: input.expiresAt,
          maxDownloads: input.maxDownloads,
          downloadCount: 0,
          viewCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        return mapRow(row);
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw s3Error("CONFLICT", undefined, { cause: error });
        }
        throw error;
      }
    },

    async update(id, input) {
      const orm = await getOrm();
      const { count } = await orm.updateMany("shareLink", {
        where: (b) => b.and(b("id", "=", id), b.isNull("revokedAt")),
        set: {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.passwordHash !== undefined && {
            passwordHash: input.passwordHash,
          }),
          ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
          ...(input.maxDownloads !== undefined && {
            maxDownloads: input.maxDownloads,
          }),
          updatedAt: new Date(),
        },
      });
      if (count === 0) return null;
      const row = await findById(id);
      return row && row.revokedAt === null ? row : null;
    },

    async revoke(id) {
      const orm = await getOrm();
      const now = new Date();
      const { count } = await orm.updateMany("shareLink", {
        where: (b) => b.and(b("id", "=", id), b.isNull("revokedAt")),
        set: { revokedAt: now, updatedAt: now },
      });
      const record = await findById(id);
      if (!record) return null;
      // Only the call whose write matched turned it off.
      return { record, revoked: count > 0 };
    },

    async countDownload(link) {
      const orm = await getOrm();
      const now = new Date();
      // One statement: a revoke, an expiry, or the limit reached meanwhile
      // leaves no match, and concurrent downloads each add one.
      const { count } = await orm.updateMany("shareLink", {
        where: (b) =>
          b.and(
            b("id", "=", link.id),
            b.isNull("revokedAt"),
            b.or(b.isNull("expiresAt"), b("expiresAt", ">", now)),
            b.or(
              b.isNull("maxDownloads"),
              b("downloadCount", "<", b.ref("maxDownloads")),
            ),
          ),
        set: { downloadCount: increment(1), lastAccessedAt: now },
      });
      const current = await findById(link.id);
      if (!current) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
      if (count > 0) return current;
      switch (shareLinkStatus(current, now)) {
        case "revoked":
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
        case "expired":
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXPIRED);
        case "exhausted":
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXHAUSTED);
        case "active":
          // The owner raised the limit or the expiry right after the write.
          throw s3Error("CONFLICT");
      }
    },

    async countView(link) {
      const orm = await getOrm();
      await orm.updateMany("shareLink", {
        where: (b) => b("id", "=", link.id),
        set: { viewCount: increment(1), lastAccessedAt: new Date() },
      });
    },

    async revokeTarget(target) {
      const orm = await getOrm();
      const now = new Date();
      const { count } = await orm.updateMany("shareLink", {
        where: (b) =>
          b.and(
            b("targetType", "=", target.type),
            target.type === "object"
              ? b("objectId", "=", target.objectId)
              : b("folderId", "=", target.folderId),
            b.isNull("revokedAt"),
          ),
        set: { revokedAt: now, updatedAt: now },
      });
      return count;
    },

    async prune(olderThan) {
      const orm = await getOrm();
      let pruned = 0;
      for (;;) {
        // Ids first, so the count is what this call deleted.
        const rows = await orm.findMany("shareLink", {
          select: ["id"],
          where: (b) =>
            b.or(
              b("revokedAt", "<", olderThan),
              b.and(b.isNotNull("expiresAt"), b("expiresAt", "<", olderThan)),
            ),
          limit: BATCH_SIZE,
        });
        if (rows.length === 0) return pruned;
        pruned += await deleteMany(rows.map((row) => row.id));
        if (rows.length < BATCH_SIZE) return pruned;
      }
    },

    async listOld(olderThan, after) {
      const orm = await getOrm();
      const rows = await orm.findMany("shareLink", {
        where: (b) =>
          b.and(
            b.isNull("revokedAt"),
            b("createdAt", "<", olderThan),
            after === null || b("id", ">", after),
          ),
        orderBy: [["id", "asc"]],
        limit: BATCH_SIZE,
      });
      return rows.map(mapRow);
    },

    deleteMany,
  };
}
