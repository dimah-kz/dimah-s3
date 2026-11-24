import type { StorageFolder, StorageObject } from "@dimah-s3/db";
import type { ShareLinkRecord } from "@/store/link-store";
import type {
  ShareClientLink,
  ShareClientTarget,
  ShareVisitorFolder,
  ShareVisitorObject,
} from "@/types/client";
import { shareLinkStatus, type ShareLink } from "@/types/link";

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

/** A row without its password hash, as `s3.share.links` and the hooks see it. */
export function toShareLink(record: ShareLinkRecord): ShareLink {
  const { passwordHash: _passwordHash, ...link } = record;
  return link;
}

/** Downloads left before the limit, or `null` without one. */
export function downloadsLeft(
  link: Pick<ShareLink, "maxDownloads" | "downloadCount">,
): number | null {
  return link.maxDownloads === null
    ? null
    : Math.max(link.maxDownloads - link.downloadCount, 0);
}

/** The target an owner sees: the live object or folder, or what is left of it. */
export function toClientTarget(
  link: ShareLink,
  loaded: StorageObject<unknown> | StorageFolder | null,
): ShareClientTarget {
  if (link.target.type === "object") {
    const object = loaded as StorageObject<unknown> | null;
    return {
      type: "object",
      id: link.target.objectId,
      key: object?.key ?? null,
      name: object?.name ?? null,
      available: object !== null,
    };
  }
  const folder = loaded as StorageFolder | null;
  return {
    type: "folder",
    id: link.target.folderId,
    name: folder?.name ?? null,
    path: folder?.path ?? null,
    available: folder !== null,
  };
}

/** A link as its owner sees it. */
export function toClientLink(
  link: ShareLink,
  target: ShareClientTarget,
  url: ((token: string) => string) | undefined,
): ShareClientLink {
  return {
    id: link.id,
    token: link.token,
    url: url ? url(link.token) : null,
    status: shareLinkStatus(link),
    target,
    label: link.label,
    passwordProtected: link.passwordProtected,
    expiresAt: iso(link.expiresAt),
    maxDownloads: link.maxDownloads,
    downloadCount: link.downloadCount,
    viewCount: link.viewCount,
    lastAccessedAt: iso(link.lastAccessedAt),
    revokedAt: iso(link.revokedAt),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

/**
 * A folder id as a visitor sees it: the top of the share is `null`, so the
 * folders above it stay hidden.
 */
export function visitorFolderId(
  folderId: string | null,
  rootId: string | null,
): string | null {
  return folderId === rootId ? null : folderId;
}

/** A shared file, without its key, scope, or route. */
export function toVisitorObject(
  object: StorageObject<unknown>,
  rootId: string | null,
): ShareVisitorObject {
  return {
    id: object.id,
    name: object.name,
    size: object.size,
    contentType: object.contentType,
    updatedAt: object.updatedAt.toISOString(),
    folderId: visitorFolderId(object.folderId, rootId),
  };
}

/** A folder inside a share, without its path or scope. */
export function toVisitorFolder(
  folder: StorageFolder,
  rootId: string | null,
): ShareVisitorFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId:
      folder.id === rootId ? null : visitorFolderId(folder.parentId, rootId),
  };
}
