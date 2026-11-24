import type { StorageFolder, StorageObject } from "@dimah-s3/db";
import type { DimahS3Locals } from "@dimah-s3/server";
import type { ShareOwnerAction } from "@/constants";
import type { DimahS3ShareClient } from "@/fuma-db";
import type { ShareLink } from "./link";

/** The request a share call runs for, and the guards' `locals`. */
export type ShareCall = {
  request: Request;
  locals: DimahS3Locals;
};

/** An owner call: the request and the owner's db scope. */
export type ShareOwnerCall = ShareCall & { scope: string };

/** What a link points at, loaded from `@dimah-s3/db`. */
export type ShareResolvedTarget =
  | { type: "object"; object: StorageObject<unknown> }
  | { type: "folder"; folder: StorageFolder };

/** The settings a link will have after a create or an update. */
export type ShareLinkSettings = {
  expiresAt: Date | null;
  passwordProtected: boolean;
  maxDownloads: number | null;
  label: string | null;
};

/**
 * What `authorize` checks for an owner action, after the scope is resolved
 * and the link or its target is known to be the caller's.
 */
export type ShareAuthorizeContext = ShareOwnerCall & {
  action: ShareOwnerAction;
  /**
   * What the link points at. Set on `createLink`, and on the actions on one
   * link while its target exists.
   */
  target?: ShareResolvedTarget;
  /** The link as it is. Set on `getLink`, `updateLink`, and `revokeLink`. */
  link?: ShareLink;
  /** The settings it will have. Set on `createLink` and `updateLink`. */
  settings?: ShareLinkSettings;
};

/** Context of `onCreated` and `onRevoked`. */
export type ShareLinkEventContext = ShareOwnerCall & { link: ShareLink };

/** Context of `onUpdated`. */
export type ShareLinkUpdatedContext = ShareLinkEventContext & {
  /** The link before the update. */
  previous: ShareLink;
};

/** Context of `onOpened`: a visitor opened an unlocked link. */
export type ShareOpenedContext = ShareCall & {
  link: ShareLink;
  target: ShareResolvedTarget;
};

/** Context of `onDownloaded`: a visitor got a download URL. */
export type ShareDownloadedContext = ShareCall & {
  link: ShareLink;
  /** The file the URL downloads. */
  object: StorageObject<unknown>;
};

/** A hook that runs after an action. A throw fails the call. */
export type ShareHook<C> = (context: C) => void | Promise<void>;

/** Lifetimes of new links, in seconds. */
export type ShareExpirationOptions = {
  /**
   * Lifetime of a link created without `expiresAt`. `null`: such a link
   * never expires. @default 604800 (7 days)
   */
  default?: number | null;
  /**
   * Longest lifetime a link can have. With it, every link expires, and a
   * longer `expiresAt` fails with `VALIDATION_ERROR`.
   */
  max?: number;
};

/** Password rules for new and updated links. */
export type SharePasswordOptions = {
  /** Every link needs a password. @default false */
  required?: boolean;
  /** Shortest password, in characters. @default 8 */
  minLength?: number;
};

/** Options of the `share()` plugin. */
export type ShareOptions = {
  /** `DimahS3Share.client(adapter)`, with the same adapter as `db()`. */
  client: DimahS3ShareClient;
  /**
   * The page a visitor opens for a token, such as
   * `` (token) => `https://app.example.com/s/${token}` ``. Owner responses
   * carry it as `link.url`; without it, `url` is `null`.
   */
  url?: (token: string) => string;
  /** Lifetimes of new links. */
  expiration?: ShareExpirationOptions;
  /** Password rules. */
  password?: SharePasswordOptions;
  /** Allow links to folders. @default true */
  folders?: boolean;
  /**
   * Lifetime of a download URL a visitor gets, in seconds, capped by the
   * route's `download.maxExpiresIn`. A revoked link stops handing out URLs
   * at once; a URL already handed out works until it expires.
   * @default 300
   */
  downloadExpiresIn?: number;
  /** Lifetime of an `access` proof from `unlockLink`, in seconds. @default 3600 */
  unlockExpiresIn?: number;
  /**
   * Runs for every owner action, after the caller's scope is resolved and
   * the link or its target is known to be theirs, so it can only narrow
   * access. `false` rejects the call with `FORBIDDEN`. db's own
   * `authorize` runs before it, as `operation: "plugin"`.
   */
  authorize?: (context: ShareAuthorizeContext) => boolean | Promise<boolean>;
  /** After a link is created. */
  onCreated?: ShareHook<ShareLinkEventContext>;
  /** After a link's settings change. */
  onUpdated?: ShareHook<ShareLinkUpdatedContext>;
  /** After a link is revoked. Revoking a revoked link does not run it. */
  onRevoked?: ShareHook<ShareLinkEventContext>;
  /** After a visitor opens an unlocked link. */
  onOpened?: ShareHook<ShareOpenedContext>;
  /** After a visitor gets a download URL, once the download is counted. */
  onDownloaded?: ShareHook<ShareDownloadedContext>;
};
