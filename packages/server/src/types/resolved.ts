import type { S3Client } from "@aws-sdk/client-s3";
import type {
  ContentDispositionType,
  S3ObjectAcl,
  UploadPresignMethod,
} from "@dimah-s3/core";
import type {
  DimahS3Config,
  DimahS3Logger,
  DownloadConfig,
  TicketSubject,
  UploadConfig,
} from "./config";
import type {
  DeleteGuardContext,
  DeleteOnDeletedContext,
  DownloadGuardContext,
  DownloadOnPresignedContext,
  GuardContext,
  MultipartGuardContext,
  MultipartOnAbortContext,
  RouteGuardContext,
  UploadConfirmGuardContext,
  UploadGuardContext,
  UploadOnConfirmedContext,
  UploadOnStartContext,
} from "./hook-contexts";
import type { DimahS3RoutePluginOptions, Guard, LifecycleHook } from "./locals";

/*
 * Internal: the config after `dimahS3()` applies defaults and merges plugin
 * hooks. Not exported from the package.
 */

/**
 * A route feature a call can hit. `multipart` is nested under upload, and
 * `proxy` is a download in `mode: "proxy"`, the only one `/file` serves.
 */
export type RouteFeature =
  "upload" | "download" | "delete" | "multipart" | "proxy";

/** One hook and its owner. `plugin` is the plugin id; the user hook has none. */
export type HookEntry<H> = { plugin?: string; hook: H };

/** Hooks for one slot, in run order: plugins in plugin order, then the user hook. */
export type HookList<H> = readonly HookEntry<H>[];

export type DisabledFeature = { enabled: false };

export type ResolvedMultipart = {
  enabled: true;
  /** Preferred part size. The part layout may raise it. */
  partSize?: number;
  ticketExpiresIn: number;
  guard: HookList<Guard<MultipartGuardContext>>;
  onAbort: HookList<LifecycleHook<MultipartOnAbortContext>>;
};

export type ResolvedUpload = {
  enabled: true;
  fileTypes?: readonly string[];
  maxFileSize?: number;
  object?: UploadConfig["object"];
  acl: S3ObjectAcl;
  method: UploadPresignMethod;
  /** URL TTL, already capped by the instance `maxExpiresIn`. */
  expiresIn: number;
  confirmWindow: number;
  /** Effective value: `true` whenever `verifyContent` is on. */
  checksum: boolean;
  verifyContent: boolean;
  multipart: ResolvedMultipart | DisabledFeature;
  guard: HookList<Guard<UploadGuardContext>>;
  onStart: HookList<LifecycleHook<UploadOnStartContext>>;
  confirmGuard: HookList<Guard<UploadConfirmGuardContext>>;
  onConfirmed: HookList<LifecycleHook<UploadOnConfirmedContext>>;
};

export type ResolvedDownload = {
  enabled: true;
  /** Already capped by the instance `maxExpiresIn`. */
  maxExpiresIn: number;
  disposition: ContentDispositionType;
  /**
   * Effective allow-list: the config value, else `DEFAULT_INLINE_TYPES`
   * (without `application/pdf` in proxy mode). `false` never inlines.
   */
  inlineTypes: readonly string[] | false;
  mode: "presign" | "proxy";
  resolve?: DownloadConfig["resolve"];
  guard: HookList<Guard<DownloadGuardContext>>;
  onPresigned: HookList<LifecycleHook<DownloadOnPresignedContext>>;
};

export type ResolvedDelete = {
  enabled: true;
  guard: HookList<Guard<DeleteGuardContext>>;
  onDeleted: HookList<LifecycleHook<DeleteOnDeletedContext>>;
};

export type ResolvedRoute = {
  name: string;
  client: S3Client;
  bucket: string;
  /** `false` means keys are not namespace-checked. */
  keyPrefix: string | false;
  /** The route `plugins` field as configured. */
  plugins: DimahS3RoutePluginOptions;
  guard: HookList<Guard<RouteGuardContext>>;
  upload: ResolvedUpload | (DisabledFeature & { multipart: DisabledFeature });
  download: ResolvedDownload | DisabledFeature;
  delete: ResolvedDelete | DisabledFeature;
};

/** A {@link ResolvedRoute} after the feature `F` was checked to be on. */
export type OpenedRoute<F extends RouteFeature> = ResolvedRoute &
  (F extends "multipart"
    ? { upload: ResolvedUpload & { multipart: ResolvedMultipart } }
    : F extends "upload"
      ? { upload: ResolvedUpload }
      : F extends "download"
        ? { download: ResolvedDownload }
        : F extends "proxy"
          ? { download: ResolvedDownload & { mode: "proxy" } }
          : { delete: ResolvedDelete });

export type ResolvedConfig = {
  /** Normalized, without a trailing slash. */
  basePath: string;
  baseURL?: string;
  /**
   * Secrets from the config, first one signs. `undefined` means the
   * environment or development fallback is resolved on first use.
   */
  secret?: readonly string[];
  /** From the config, else the first plugin that provides one. */
  ticketSubject?: TicketSubject;
  maxExpiresIn: number;
  maxRequestBodySize: number;
  /** `false` in the config resolves to a logger with no methods. */
  logger: DimahS3Logger;
  onError?: DimahS3Config["onError"];
  guard: HookList<Guard<GuardContext>>;
  routes: Readonly<Record<string, ResolvedRoute>>;
};
