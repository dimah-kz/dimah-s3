import { base64UrlDecode, base64UrlEncode, s3Error } from "@dimah-s3/core";
import { UniqueConstraintError } from "fumadb";
import type { AbstractQuery, FindManyOptions } from "fumadb/query";
import { SHARE_ERROR_CODES } from "@/error-codes";
import { SHARE_LIST_DEFAULT_LIMIT } from "@/constants";
import type { shareSchema } from "@/schema/schema";
import type { ShareLink, ShareLinkTarget } from "@/types/link";

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

/** Times a counted download retries after a concurrent one won. */
const COUNT_ATTEMPTS = 5;

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
  writeToken: string | null;
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
  /** Also list revoked links. @default false */
  includeRevoked?: boolean;
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
   * Counts one download as a compare-and-set on `download_count`, while the
   * link is not revoked, has not expired, and is under `maxDownloads`.
   * Returns the row with the new count.
   * @throws `SHARE_LINK_EXHAUSTED` when the limit is reached meanwhile,
   * `SHARE_LINK_NOT_FOUND` when the row changed state, or `CONFLICT` when
   * concurrent downloads kept winning.
   */
  countDownload: (link: ShareLinkRecord) => Promise<ShareLinkRecord>;
  /** Counts one view, best effort: a concurrent view can win. */
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

/** A new write token: 12 random bytes in base64url. */
function newWriteToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(12)));
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
    const where = (b: LinkConditions) => b("id", "in", [...ids]);
    const present = await orm.count("shareLink", { where });
    await orm.deleteMany("shareLink", { where });
    return present;
  };

  const filterConditions = (
    b: LinkConditions,
    scope: string,
    filter: LinkFilter,
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
    if (filter.includeRevoked !== true) parts.push(b.isNull("revokedAt"));
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
      const rows = await orm.findMany("shareLink", {
        where: (b) => {
          const parts = filterConditions(b, scope, input);
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
      return orm.count("shareLink", {
        where: (b) => b.and(...filterConditions(b, scope, filter)),
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
      await orm.updateMany("shareLink", {
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
      const row = await findById(id);
      return row && row.revokedAt === null ? row : null;
    },

    async revoke(id) {
      const orm = await getOrm();
      const now = new Date();
      const token = newWriteToken();
      await orm.updateMany("shareLink", {
        where: (b) => b.and(b("id", "=", id), b.isNull("revokedAt")),
        set: { revokedAt: now, updatedAt: now, writeToken: token },
      });
      const row = await orm.findFirst("shareLink", {
        where: (b) => b("id", "=", id),
      });
      if (!row) return null;
      // Only the call whose write landed sees its own token.
      return { record: mapRow(row), revoked: row.writeToken === token };
    },

    async countDownload(link) {
      const orm = await getOrm();
      let current = link;
      for (let attempt = 0; attempt < COUNT_ATTEMPTS; attempt++) {
        if (current.revokedAt !== null) {
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
        }
        if (
          current.maxDownloads !== null &&
          current.downloadCount >= current.maxDownloads
        ) {
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXHAUSTED);
        }
        const now = new Date();
        if (current.expiresAt !== null && current.expiresAt <= now) {
          throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXPIRED);
        }
        const token = newWriteToken();
        const seen = current;
        await orm.updateMany("shareLink", {
          // The row as it was checked: a new count, limit, or expiry, or a
          // revoke in between, leaves no match.
          where: (b) =>
            b.and(
              b("id", "=", seen.id),
              b("downloadCount", "=", seen.downloadCount),
              seen.maxDownloads === null
                ? b.isNull("maxDownloads")
                : b("maxDownloads", "=", seen.maxDownloads),
              seen.expiresAt === null
                ? b.isNull("expiresAt")
                : b("expiresAt", "=", seen.expiresAt),
              b.isNull("revokedAt"),
            ),
          set: {
            downloadCount: seen.downloadCount + 1,
            writeToken: token,
            lastAccessedAt: now,
          },
        });
        const row = await orm.findFirst("shareLink", {
          where: (b) => b("id", "=", current.id),
        });
        if (!row) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
        if (row.writeToken === token) return mapRow(row);
        // Another download, or a change to the link, won; read it again.
        current = mapRow(row);
      }
      throw s3Error("CONFLICT");
    },

    async countView(link) {
      const orm = await getOrm();
      await orm.updateMany("shareLink", {
        where: (b) =>
          b.and(b("id", "=", link.id), b("viewCount", "=", link.viewCount)),
        set: { viewCount: link.viewCount + 1, lastAccessedAt: new Date() },
      });
    },

    async revokeTarget(target) {
      const orm = await getOrm();
      const now = new Date();
      const where = (b: LinkConditions) =>
        b.and(
          b("targetType", "=", target.type),
          target.type === "object"
            ? b("objectId", "=", target.objectId)
            : b("folderId", "=", target.folderId),
          b.isNull("revokedAt"),
        );
      const revoked = await orm.count("shareLink", { where });
      if (revoked > 0) {
        await orm.updateMany("shareLink", {
          where,
          set: { revokedAt: now, updatedAt: now },
        });
      }
      return revoked;
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
