/**
 * Where a link points: one `@dimah-s3/db` object, or one folder with
 * everything below it.
 */
export type ShareLinkTarget =
  { type: "object"; objectId: string } | { type: "folder"; folderId: string };

/**
 * Whether a link opens.
 * - `active`: it opens
 * - `expired`: `expiresAt` has passed
 * - `revoked`: the owner turned it off
 * - `exhausted`: it reached `maxDownloads`
 *
 * A link whose object or folder is gone is still `active`; opening it fails
 * with `SHARE_TARGET_UNAVAILABLE`.
 */
export type ShareLinkStatus = "active" | "expired" | "revoked" | "exhausted";

/**
 * A `share_link` row as `s3.share.links` returns it. The password hash
 * stays inside the plugin.
 */
export type ShareLink = {
  id: string;
  /** The secret of the link URL. Anyone who holds it can open the link. */
  token: string;
  /** Owner: the db scope that created the link, such as `user:123`. */
  scope: string;
  target: ShareLinkTarget;
  /** The owner's note. Visitors never see it. */
  label: string | null;
  /** True when visitors must enter a password first. */
  passwordProtected: boolean;
  /** `null` never expires. */
  expiresAt: Date | null;
  /** `null` has no download limit. */
  maxDownloads: number | null;
  /** Downloads the link handed out. */
  downloadCount: number;
  /** Times the link was opened and unlocked. Concurrent opens can miss a count. */
  viewCount: number;
  /** Last open or download. */
  lastAccessedAt: Date | null;
  /** When the owner turned the link off. */
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The status of a link at `now`. Revoked wins over expired, and expired
 * over exhausted.
 */
export function shareLinkStatus(
  link: Pick<
    ShareLink,
    "revokedAt" | "expiresAt" | "maxDownloads" | "downloadCount"
  >,
  now: Date = new Date(),
): ShareLinkStatus {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return "exhausted";
  }
  return "active";
}
