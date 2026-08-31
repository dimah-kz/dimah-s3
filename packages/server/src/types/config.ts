import type { S3Client } from "@aws-sdk/client-s3";
import type { S3ObjectAcl, UploadPresignMethod } from "@dimah-s3/core";
import type {
  DeleteGuardContext,
  DeleteOnDeletedContext,
  DownloadOnPresignedContext,
  DownloadPresignGuardContext,
  GuardContext,
  MultipartAbortGuardContext,
  MultipartCompleteGuardContext,
  MultipartInitGuardContext,
  MultipartListGuardContext,
  MultipartOnAbortContext,
  MultipartOnCompleteContext,
  MultipartOnInitContext,
  MultipartOnListContext,
  MultipartPartGuardContext,
  ObjectContext,
  ObjectInfo,
  RouteGuardContext,
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
  UploadOnPresignedContext,
  UploadPresignGuardContext,
} from "./hook-contexts";
import type { DimahS3Plugin } from "@/plugin/types";

export type { ObjectContext, ObjectInfo };

/** Upload policy: constraints, object identity, and lifecycle hooks. */
export type UploadConfig = {
  /** HTML `accept` tokens (`image/*`, `.pdf`, `application/pdf`). */
  fileTypes?: string[];
  /** Max declared and HeadObject size in bytes. */
  maxFileSize?: number;
  /**
   * Server-owned object identity. Return `prefix` for a folder,
   * `key` for the full key, plus optional S3 `metadata` and `acl`.
   * Runs on upload / multipart init only. Default key is
   * `{route}/{uuid}/{name}`.
   */
  object?: (
    context: ObjectContext,
  ) => ObjectInfo | void | Promise<ObjectInfo | void>;
  /**
   * Server-forced ACL when `object` does not return one.
   * @default "private"
   */
  acl?: S3ObjectAcl;
  /** Presign verb. Use `"PUT"` on R2 (no Presigned POST). @default "POST" */
  method?: UploadPresignMethod;
  /** Presign TTL in seconds. Clamped by instance `maxExpiresIn`. */
  expiresIn?: number;
  guard?: (context: UploadPresignGuardContext) => Promise<void> | void;
  onPresigned?: (context: UploadOnPresignedContext) => Promise<void> | void;
  confirmGuard?: (context: UploadConfirmGuardContext) => Promise<void> | void;
  onConfirmed?: (context: UploadOnConfirmedContext) => Promise<void> | void;
};

/** Download feature. A config object (or `true`) enables the feature. */
export type DownloadConfig = {
  /** Presign TTL in seconds. Falls back to the route `expiresIn`. */
  expiresIn?: number;
  guard?: (context: DownloadPresignGuardContext) => Promise<void> | void;
  onPresigned?: (context: DownloadOnPresignedContext) => Promise<void> | void;
};

/** Delete feature. A config object (or `true`) enables the feature. */
export type DeleteConfig = {
  guard?: (context: DeleteGuardContext) => Promise<void> | void;
  onDeleted?: (context: DeleteOnDeletedContext) => Promise<void> | void;
};

/**
 * Multipart lifecycle hooks. Consumers enable multipart with `multipart: true`
 * on the route; plugins may still contribute these fields.
 */
export type MultipartConfig = {
  initGuard?: (context: MultipartInitGuardContext) => Promise<void> | void;
  partGuard?: (context: MultipartPartGuardContext) => Promise<void> | void;
  completeGuard?: (
    context: MultipartCompleteGuardContext,
  ) => Promise<void> | void;
  abortGuard?: (context: MultipartAbortGuardContext) => Promise<void> | void;
  listGuard?: (context: MultipartListGuardContext) => Promise<void> | void;
  onInit?: (context: MultipartOnInitContext) => Promise<void> | void;
  onComplete?: (context: MultipartOnCompleteContext) => Promise<void> | void;
  onAbort?: (context: MultipartOnAbortContext) => Promise<void> | void;
  onList?: (context: MultipartOnListContext) => Promise<void> | void;
};

/** `true` or an options object enables the feature; omit or `false` disables it. */
export type FeatureToggle<T> = boolean | T;

/**
 * Named file-route policy — a mini {@link DimahS3Config} under `routes`.
 * Upload is on when omitted; download, delete, and multipart are off.
 */
export type DimahS3RouteConfig = {
  /** Override the instance S3 client for this route. */
  client?: S3Client;
  /** Override the instance bucket for this route. */
  bucket?: string;
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
  /** Opt-in multipart. Default `false`. Requires upload. */
  multipart?: boolean;
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
 *       upload: { fileTypes: ["image/*"] },
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
   * Upper bound for route `expiresIn` (seconds). The protocol maximum is
   * 7 days (604800).
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

type ResolvedFeature<T> = T & { enabled: boolean };

/** One named route after {@link dimahS3} normalizes booleans, inheritance, and plugin hooks. */
export type ResolvedRoutePolicy = {
  name: string;
  client: S3Client;
  bucket: string;
  fileTypes?: string[];
  maxFileSize?: number;
  object?: UploadConfig["object"];
  acl?: S3ObjectAcl;
  method?: UploadPresignMethod;
  expiresIn?: number;
  guard?: DimahS3RouteConfig["guard"];
  skippedPluginIds: ReadonlySet<string>;
  upload?: ResolvedFeature<UploadConfig>;
  download?: ResolvedFeature<DownloadConfig>;
  delete?: ResolvedFeature<DeleteConfig>;
  multipart?: ResolvedFeature<MultipartConfig>;
};

/** Instance config after {@link dimahS3} normalizes routes and plugins. */
export type ResolvedDimahS3Config = Omit<
  DimahS3Config,
  "routes" | "plugins"
> & {
  routes: Record<string, ResolvedRoutePolicy>;
};
