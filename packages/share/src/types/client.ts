import type { ContentDispositionType, S3RequestOptions } from "@dimah-s3/core";
import type { ShareLinkStatus } from "./link";

/*
 * The wire contract of the share endpoints. `shareClient()` and
 * `s3.share.api` send and return these shapes. Dates are ISO strings.
 */

// ---------------------------------------------------------------------------
// Owner: links
// ---------------------------------------------------------------------------

/**
 * What a new link points at: an object by its key, or a folder by its id.
 * `bucket` is needed only when the routes use several buckets.
 */
export type ShareTargetInput =
  | { type: "object"; key: string; bucket?: string }
  | { type: "folder"; folderId: string };

/** The settings a link can have. Omitted fields take the plugin defaults. */
export type ShareLinkSettingsInput = {
  /**
   * When the link stops opening. Omitted, the plugin's
   * `expiration.default` applies. `null` never expires, unless the plugin
   * sets `expiration.max`.
   */
  expiresAt?: Date | string | null;
  /**
   * The link's lifetime in whole seconds, instead of `expiresAt`. The
   * server adds it to its own clock, so a browser clock that runs ahead or
   * behind cannot break `expiration.max`. Sending both fails with
   * `VALIDATION_ERROR`.
   */
  expiresIn?: number;
  /** Visitors enter it first. `null` or omitted: no password. */
  password?: string | null;
  /** Downloads the link hands out. `null` or omitted: no limit. */
  maxDownloads?: number | null;
  /** Your note, such as who the link is for. Visitors never see it. */
  label?: string | null;
};

/** Body of `POST /share/link` (`createLink`). */
export type ShareCreateLinkInput = ShareLinkSettingsInput & {
  target: ShareTargetInput;
};

/**
 * Body of `PATCH /share/link` (`updateLink`). Omitted fields stay as they
 * are; `null` clears a password, an expiry, or a limit. A revoked link
 * cannot change.
 */
export type ShareUpdateLinkInput = ShareLinkSettingsInput & { id: string };

/** Query of `GET /share/links` (`listLinks`). */
export type ShareListLinksInput = {
  /** Only links to this object or folder. */
  target?: ShareTargetInput;
  /** Also list revoked links. Ignored with `status`. @default false */
  includeRevoked?: boolean;
  /**
   * Only links in this status or these statuses, by the server's clock,
   * such as `"active"` for the links that still open. Takes precedence
   * over `includeRevoked`.
   */
  status?: ShareLinkStatus | readonly ShareLinkStatus[];
  /** @default 50 */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
};

/** What a link points at, as its owner sees it. */
export type ShareClientTarget =
  | {
      type: "object";
      /** `storage_object.id`. */
      id: string;
      /** `null` once the object is gone. */
      key: string | null;
      name: string | null;
      /** False once the object was deleted: the link opens no more. */
      available: boolean;
    }
  | {
      type: "folder";
      /** `storage_folder.id`. */
      id: string;
      name: string | null;
      path: string | null;
      /** False once the folder was deleted: the link opens no more. */
      available: boolean;
    };

/** A link as its owner sees it. */
export type ShareClientLink = {
  id: string;
  /** The secret of the link. Anyone who holds it can open the link. */
  token: string;
  /** The page visitors open, from the plugin's `url` option. `null` without one. */
  url: string | null;
  status: ShareLinkStatus;
  target: ShareClientTarget;
  label: string | null;
  passwordProtected: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  viewCount: number;
  lastAccessedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Response of `createLink`, `getLink`, `updateLink`, and `revokeLink`. */
export type ShareLinkResponse = { link: ShareClientLink };

/** Response of `listLinks`: newest first. */
export type ShareListLinksResponse = {
  links: ShareClientLink[];
  /** `null` on the last page. */
  nextCursor: string | null;
};

// ---------------------------------------------------------------------------
// Visitor: shared items
// ---------------------------------------------------------------------------

/**
 * The proof of an unlocked password, from `unlockLink`. Send it as
 * `access` with every later visitor call. It expires with `expiresAt`, and
 * when the owner changes the password.
 */
export type ShareAccess = string;

/** Fields every visitor call sends. */
export type ShareVisitInput = {
  /** The link token, from the shared URL. */
  token: string;
  /** From `unlockLink`, for a password-protected link. */
  access?: ShareAccess;
};

/** A shared file, as a visitor sees it. The object key stays hidden. */
export type ShareVisitorObject = {
  /** Opaque id. Send it to `downloadShared`. */
  id: string;
  name: string;
  size: number | null;
  contentType: string | null;
  updatedAt: string;
  /** Folder that holds it. `null` is the top of the shared folder. */
  folderId: string | null;
};

/** A folder inside a shared folder, as a visitor sees it. */
export type ShareVisitorFolder = {
  id: string;
  name: string;
  /** `null` is the top of the shared folder. */
  parentId: string | null;
};

type ShareVisitorLinkBase = {
  passwordProtected: boolean;
  expiresAt: string | null;
  /** Downloads left before the limit. `null` has no limit. */
  downloadsLeft: number | null;
};

/**
 * A link that waits for `unlockLink`. It says nothing about what it
 * shares, only whether that is a file or a folder.
 */
export type ShareVisitorLockedLink = ShareVisitorLinkBase & {
  type: "object" | "folder";
  locked: true;
};

/** A link that opened: its file, or its folder. */
export type ShareVisitorOpenLink =
  | (ShareVisitorLinkBase & {
      type: "object";
      locked: false;
      object: ShareVisitorObject;
    })
  | (ShareVisitorLinkBase & {
      type: "folder";
      locked: false;
      folder: ShareVisitorFolder;
    });

/**
 * Response link of `openLink`. A locked link (`locked: true`) waits for
 * `unlockLink` and says nothing about what it shares.
 */
export type ShareVisitorLink = ShareVisitorLockedLink | ShareVisitorOpenLink;

/** Response of `openLink`. */
export type ShareOpenLinkResponse = { link: ShareVisitorLink };

/** Body of `POST /share/unlock` (`unlockLink`). */
export type ShareUnlockLinkInput = { token: string; password: string };

/** Response of `unlockLink`. */
export type ShareUnlockLinkResponse = {
  access: ShareAccess;
  expiresAt: string;
};

/** Fields a shared listing sorts by. */
export type ShareListSortField = "name" | "size" | "updatedAt" | "createdAt";

/** Order of a shared listing. */
export type ShareListSort = {
  field: ShareListSortField;
  direction: "asc" | "desc";
};

/** Query of `GET /share/items` (`listShared`). */
export type ShareListSharedInput = ShareVisitInput & {
  /** Folder to list. Omitted, `null`, or `""`: the top of the shared folder. */
  folderId?: string | null;
  /**
   * Text the name contains, ignoring case and accents. It searches the
   * folder and every folder below it.
   */
  search?: string;
  /** @default { field: "name", direction: "asc" } */
  sort?: ShareListSort;
  /** @default 50 */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
};

/** Response of `listShared`. An object link lists its one file. */
export type ShareListSharedResponse = {
  objects: ShareVisitorObject[];
  /** `null` on the last page. */
  nextCursor: string | null;
  /** First page of a folder: its child folders, or the matches of a search. */
  folders?: ShareVisitorFolder[];
  /** First page: the folders from the top of the share down to the open one. */
  trail?: ShareVisitorFolder[];
  /**
   * A search: the folders above its results, from the top of the share, so
   * each result can show where it lives.
   */
  locations?: ShareVisitorFolder[];
  /** First page of a search: files that match, across every page. */
  total?: number;
};

/** Body of `POST /share/download` (`downloadShared`). */
export type ShareDownloadInput = ShareVisitInput & {
  /** The file to download. Optional on an object link; required on a folder link. */
  id?: string;
  /**
   * `inline` opens the file in the browser, for a type on the route's
   * `inlineTypes`. @default the route's `download.disposition`
   */
  disposition?: ContentDispositionType;
};

/**
 * Response of `downloadShared`: a URL to navigate to. A presigned S3 URL,
 * or in proxy mode a short-lived `/share/file` URL. Each call counts as one
 * download.
 */
export type ShareDownloadResponse = {
  url: string;
  /** `presign` for a route in presign mode, `proxy` for one in proxy mode. */
  mode: "presign" | "proxy";
  /** URL validity in seconds. */
  expiresIn: number;
  disposition: ContentDispositionType;
  /** Downloads left before the limit. `null` has no limit. */
  downloadsLeft: number | null;
};

// ---------------------------------------------------------------------------
// Client actions
// ---------------------------------------------------------------------------

/**
 * `api.share` from `shareClient()`. Owner actions act on the caller's db
 * scope; visitor actions take the link token instead of a session.
 */
export type ShareClientActions = {
  /** Creates a link. The response carries its `token` and `url`. */
  createLink: (
    input: ShareCreateLinkInput,
    options?: S3RequestOptions,
  ) => Promise<ShareLinkResponse>;
  /** One page of the caller's links, newest first. */
  listLinks: (
    input?: ShareListLinksInput,
    options?: S3RequestOptions,
  ) => Promise<ShareListLinksResponse>;
  /** One link of the caller's. */
  getLink: (
    input: { id: string },
    options?: S3RequestOptions,
  ) => Promise<ShareLinkResponse>;
  /** Changes the expiry, password, download limit, or label of a link. */
  updateLink: (
    input: ShareUpdateLinkInput,
    options?: S3RequestOptions,
  ) => Promise<ShareLinkResponse>;
  /** Turns a link off for good. Revoking it again returns it as it is. */
  revokeLink: (
    input: { id: string },
    options?: S3RequestOptions,
  ) => Promise<ShareLinkResponse>;
  /** What a link shares, or that it is locked. Counts a view once unlocked. */
  openLink: (
    input: ShareVisitInput,
    options?: S3RequestOptions,
  ) => Promise<ShareOpenLinkResponse>;
  /** Trades the password for an `access` proof. */
  unlockLink: (
    input: ShareUnlockLinkInput,
    options?: S3RequestOptions,
  ) => Promise<ShareUnlockLinkResponse>;
  /** One page of a shared folder, or the file of an object link. */
  listShared: (
    input: ShareListSharedInput,
    options?: S3RequestOptions,
  ) => Promise<ShareListSharedResponse>;
  /** A download URL for one shared file. Counts one download. */
  downloadShared: (
    input: ShareDownloadInput,
    options?: S3RequestOptions,
  ) => Promise<ShareDownloadResponse>;
};
