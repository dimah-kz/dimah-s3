import type { S3Client } from "@aws-sdk/client-s3";
import type { S3ObjectAcl, UploadPresignMethod } from "@dimah-s3/core";
import type {
  DeleteGuardContext,
  DeleteOnDeletedContext,
  DownloadGuardContext,
  DownloadOnPresignedContext,
  GuardContext,
  MultipartGuardContext,
  MultipartOnAbortContext,
  MultipartOnInitContext,
  MultipartOnListContext,
  RouteGuardContext,
  UploadConfirmGuardContext,
  UploadGuardContext,
  UploadObjectContext,
  UploadObjectInfo,
  UploadOnConfirmedContext,
  UploadOnPresignedContext,
} from "./hook-contexts";
import type { DimahS3Plugin } from "@/plugin/types";

export type { UploadObjectContext, UploadObjectInfo };

/** The three nested features on a named route. */
export const ROUTE_FEATURES = ["upload", "download", "delete"] as const;
export type RouteFeature = (typeof ROUTE_FEATURES)[number];

/**
 * Endpoint operations. Multipart is nested under upload — it is not a
 * fourth route feature.
 */
export const ROUTE_OPERATIONS = [...ROUTE_FEATURES, "multipart"] as const;
export type RouteOperation = (typeof ROUTE_OPERATIONS)[number];

/** `true` or an options object enables the feature; omit or `false` disables it. */
export type FeatureToggle<T> = boolean | T;

export type DisabledFeature = { enabled: false };
export type EnabledFeature<T extends object> = T & { enabled: true };
export type ResolvedFeature<T extends object> =
  EnabledFeature<T> | DisabledFeature;

/**
 * Multipart-only hooks. Init shares `upload.guard` / `onInit`. Complete
 * runs `guard` (`action: "complete"`) then `upload.confirmGuard` /
 * `upload.onConfirmed`.
 */
export type MultipartConfig = {
  /** After `CreateMultipartUpload` — persist `uploadId` for resume. */
  onInit?: (context: MultipartOnInitContext) => Promise<void> | void;
  /** Authorize part, list, abort, and complete. Branch on `action` if needed. */
  guard?: (context: MultipartGuardContext) => Promise<void> | void;
  onAbort?: (context: MultipartOnAbortContext) => Promise<void> | void;
  onList?: (context: MultipartOnListContext) => Promise<void> | void;
};

/** Upload feature: constraints, object identity, and lifecycle hooks. */
export type UploadConfig = {
  /** HTML `accept` tokens (`image/*`, `.pdf`, `application/pdf`). */
  fileTypes?: string[];
  /**
   * Max declared size, signed part size, listed multipart total, and
   * HeadObject size in bytes.
   */
  maxFileSize?: number;
  /**
   * Server-owned object identity. Return `folder` for a directory under
   * the route `keyPrefix`, `key` for the rest of the key (also nested
   * under `keyPrefix`), plus optional S3 `metadata` and `acl`.
   * Runs on upload / multipart init only. Default key is
   * `{keyPrefix}/{uuid}/{name}` (`keyPrefix` defaults to the route name).
   * `keyPrefix: false` generates `{uuid}/{name}` and skips the follow-up
   * namespace check.
   */
  object?: (
    context: UploadObjectContext,
  ) => UploadObjectInfo | void | Promise<UploadObjectInfo | void>;
  /**
   * Server-forced ACL when `object` does not return one.
   * @default "private"
   */
  acl?: S3ObjectAcl;
  /** Presign verb. Use `"PUT"` on R2 (no Presigned POST). @default "POST" */
  method?: UploadPresignMethod;
  /** Presign TTL in seconds. Clamped by instance `maxExpiresIn`. */
  expiresIn?: number;
  /** Presign and multipart init. */
  guard?: (context: UploadGuardContext) => Promise<void> | void;
  /** After a single-shot URL is signed. Multipart uses `multipart.onInit`. */
  onPresigned?: (context: UploadOnPresignedContext) => Promise<void> | void;
  /** Confirm and multipart complete. */
  confirmGuard?: (context: UploadConfirmGuardContext) => Promise<void> | void;
  /** After HeadObject on confirm and multipart complete. */
  onConfirmed?: (context: UploadOnConfirmedContext) => Promise<void> | void;
  /** Opt-in multipart. Default off. */
  multipart?: FeatureToggle<MultipartConfig>;
};

/** Download feature. A config object (or `true`) enables the feature. */
export type DownloadConfig = {
  /**
   * Presign TTL in seconds. Defaults to `S3_DEFAULT_EXPIRES_IN` (600).
   * Independent of {@link UploadConfig.expiresIn}.
   */
  expiresIn?: number;
  guard?: (context: DownloadGuardContext) => Promise<void> | void;
  onPresigned?: (context: DownloadOnPresignedContext) => Promise<void> | void;
};

/** Delete feature. A config object (or `true`) enables the feature. */
export type DeleteConfig = {
  guard?: (context: DeleteGuardContext) => Promise<void> | void;
  onDeleted?: (context: DeleteOnDeletedContext) => Promise<void> | void;
};

/**
 * Named file route — a mini {@link DimahS3Config} under `routes`.
 * Upload, download, delete, and `upload.multipart` are off until set.
 */
export type DimahS3RouteConfig = {
  /** Override the instance S3 client for this route. */
  client?: S3Client;
  /** Override the instance bucket for this route. */
  bucket?: string;
  /**
   * Object-key namespace. Generated keys and follow-up ops (confirm,
   * download, delete, multipart) must stay under it.
   * Defaults to the route name. `false` disables the bound.
   */
  keyPrefix?: string | false;
  /** Runs before every operation on this route. */
  guard?: (context: RouteGuardContext) => Promise<void> | void;
  /**
   * Opt out of instance plugins by id (`{ db: false }`).
   * Hooks from opted-out plugins are not merged onto this route.
   */
  plugins?: { readonly [pluginId: string]: false };
  upload?: FeatureToggle<UploadConfig>;
  download?: FeatureToggle<DownloadConfig>;
  delete?: FeatureToggle<DeleteConfig>;
};

/**
 * Options for {@link dimahS3}.
 *
 * @example
 * ```ts
 * export const s3 = dimahS3({
 *   client: awsS3,
 *   bucket: "my-bucket",
 *   routes: {
 *     uploads: route({
 *       upload: { fileTypes: ["image/*"], multipart: true },
 *       download: true,
 *     }),
 *   },
 * });
 * ```
 */
export type DimahS3Config = {
  /**
   * Default AWS SDK v3 `S3Client`. Required unless every route sets
   * {@link DimahS3RouteConfig.client}.
   */
  client?: S3Client;
  /**
   * Default bucket. Required unless every route sets
   * {@link DimahS3RouteConfig.bucket}.
   */
  bucket?: string;
  /**
   * API path prefix for the HTTP `handler`.
   * Must match `createS3Client({ basePath })` on the client.
   * @default "/api/s3"
   */
  basePath?: string;
  /**
   * When enabled, confirmation procedures call GetObjectAcl to infer whether
   * the object is public-read or private.
   *
   * @default false
   */
  resolveObjectAcl?: boolean;
  /**
   * Upper bound for `upload.expiresIn` and `download.expiresIn` (seconds).
   * The protocol maximum is 7 days (604800).
   * @default 604800
   */
  maxExpiresIn?: number;
  /** Runs before every operation, before route lookup. Throw to reject. */
  guard?: (context: GuardContext) => Promise<void> | void;
  /**
   * Optional server plugins (e.g. `db()` from `@dimah-s3/db`).
   * Plugin hooks merge onto each route unless the route opts out.
   */
  plugins?: readonly DimahS3Plugin[];
  /** Named file routes. At least one is required. */
  routes: Record<string, DimahS3RouteConfig>;
};

type UploadFields = Omit<UploadConfig, "multipart">;

export type EnabledUploadConfig = EnabledFeature<UploadFields> & {
  multipart: ResolvedFeature<MultipartConfig>;
};

export type ResolvedUploadConfig =
  EnabledUploadConfig | (DisabledFeature & { multipart: DisabledFeature });

/** One named route after {@link dimahS3} normalizes toggles and plugin hooks. */
export type ResolvedRoute = {
  name: string;
  client: S3Client;
  bucket: string;
  /** `false` means follow-up keys are not namespace-checked. */
  keyPrefix: string | false;
  guard?: DimahS3RouteConfig["guard"];
  skippedPluginIds: ReadonlySet<string>;
  upload: ResolvedUploadConfig;
  download: ResolvedFeature<DownloadConfig>;
  delete: ResolvedFeature<DeleteConfig>;
};

/**
 * A {@link ResolvedRoute} after the named operation has been asserted on.
 * `route.upload.fileTypes` is typed as present only after opening `"upload"`.
 */
export type OpenedRoute<F extends RouteOperation> = F extends "multipart"
  ? ResolvedRoute & {
      upload: EnabledUploadConfig & {
        multipart: EnabledFeature<MultipartConfig>;
      };
    }
  : F extends "upload"
    ? ResolvedRoute & { upload: EnabledUploadConfig }
    : F extends "download"
      ? ResolvedRoute & { download: EnabledFeature<DownloadConfig> }
      : F extends "delete"
        ? ResolvedRoute & { delete: EnabledFeature<DeleteConfig> }
        : never;

/** Instance config after {@link dimahS3} normalizes routes and plugins. */
export type ResolvedDimahS3Config = Omit<
  DimahS3Config,
  "routes" | "plugins"
> & {
  routes: Record<string, ResolvedRoute>;
};
