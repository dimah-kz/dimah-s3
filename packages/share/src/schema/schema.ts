import { column, idColumn, schema, table } from "fumadb/schema";
import { SHARE_LABEL_MAX_LENGTH } from "@/constants";

/**
 * MySQL collation of every text column: tokens, scopes, and ids compare
 * byte for byte.
 */
const BINARY = { mysql: "utf8mb4_bin" };

/** Longest scope, in characters: the `@dimah-s3/db` limit. */
export const SCOPE_MAX_LENGTH = 255;

/** Longest owner label, in characters. */
export const LABEL_MAX_LENGTH = SHARE_LABEL_MAX_LENGTH;

function string(name: string, length = 255) {
  return column(name, `varchar(${length})`).collate(BINARY);
}

/**
 * One row per share link. A link points at one `storage_object` row or one
 * `storage_folder` row of `@dimah-s3/db`, by id. It is revoked, not
 * deleted, until `pruneLinks` removes it.
 */
const shareLink = table("share_link", {
  id: idColumn("id", "varchar(255)").collate(BINARY).defaultTo$("auto"),
  /** Secret of the link URL: 24 random bytes in base64url. */
  token: string("token", 64),
  /** Owner: the db scope that created the link, such as `user:123`. */
  scope: string("scope", SCOPE_MAX_LENGTH),
  /** `object` or `folder`. */
  targetType: string("target_type", 16),
  /** `storage_object.id` of an object link. */
  objectId: string("object_id").nullable(),
  /** `storage_folder.id` of a folder link. */
  folderId: string("folder_id").nullable(),
  /** The owner's note. Visitors never see it. */
  label: string("label", LABEL_MAX_LENGTH).nullable(),
  /** PBKDF2 hash of the password, with its salt and iteration count. */
  passwordHash: string("password_hash").nullable(),
  /** `null` never expires. */
  expiresAt: column("expires_at", "timestamp").nullable(),
  /** `null` has no download limit. */
  maxDownloads: column("max_downloads", "integer").nullable(),
  downloadCount: column("download_count", "integer").defaultTo(0),
  viewCount: column("view_count", "integer").defaultTo(0),
  /**
   * No longer written: a write tells whether it landed from the rows it
   * matched. Earlier 2.x versions wrote a token here and read it back. The
   * column stays until a major release changes the share schema.
   */
  writeToken: string("write_token", 32).nullable(),
  lastAccessedAt: column("last_accessed_at", "timestamp").nullable(),
  revokedAt: column("revoked_at", "timestamp").nullable(),
  createdAt: column("created_at", "timestamp").defaultTo$("now"),
  updatedAt: column("updated_at", "timestamp").defaultTo$("now"),
})
  .unique("share_link_token_uk", ["token"])
  .index("share_link_scope_created_idx", ["scope", "createdAt"])
  .index("share_link_object_idx", ["objectId"])
  .index("share_link_folder_idx", ["folderId"]);

/**
 * The @dimah-s3/share schema, version `1.0.0`. FumaDB creates it
 * (`migrate`) and generates it for Drizzle and Prisma.
 */
export const shareSchema = schema({
  version: "1.0.0",
  tables: {
    shareLink,
  },
});
