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
  ResolveKeyContext,
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
  UploadOnPresignedContext,
  UploadPresignGuardContext,
} from "./hook-contexts";
import type { DimahS3Plugin } from "@/plugin/types";

export type { ResolveKeyContext };

/**
 * Static folder, or a factory that returns one from {@link ResolveKeyContext}.
 * The return value is prepended — it is not the full object key. Use
 * {@link KeyPolicy.resolveKey} when you need to replace the key entirely.
 */
export type KeyPrefix =
  string | ((context: ResolveKeyContext) => string | Promise<string>);

export type KeyPolicy = {
  /**
   * Prepended to the client-proposed key. A string or an async factory with
   * the same {@link ResolveKeyContext} as {@link resolveKey} (session, tenant,
   * …). Already-prefixed keys are left unchanged so confirm / download of the
   * stored key still work.
   */
  prefix?: KeyPrefix;
  /**
   * Full control over the object key. Wins over {@link prefix}. Must be
   * deterministic across presign, confirm, download, and delete — a new key
   * each time misses the object.
   */
  resolveKey?: (context: ResolveKeyContext) => string | Promise<string>;
};

export type AclPolicy = {
  /**
   * Server-forced ACL. When set, the client `acl` is ignored.
   * @default "private" (when omitted)
   */
  acl?: S3ObjectAcl;
  /**
   * Honor a client-sent `acl` (`private` | `public-read`). Off by default —
   * uploads are `private` unless {@link acl} is set.
   */
  allowClientAcl?: boolean;
};

/** Upload feature. A config object (or `true`) enables the feature. */
export type UploadConfig = KeyPolicy &
  AclPolicy & {
    method?: UploadPresignMethod;
    requireFileSize?: boolean;
    guard?: (context: UploadPresignGuardContext) => Promise<void> | void;
    onPresigned?: (context: UploadOnPresignedContext) => Promise<void> | void;
    confirmGuard?: (context: UploadConfirmGuardContext) => Promise<void> | void;
    onConfirmed?: (context: UploadOnConfirmedContext) => Promise<void> | void;
  };

/** Download feature. A config object (or `true`) enables the feature. */
export type DownloadConfig = KeyPolicy & {
  guard?: (context: DownloadPresignGuardContext) => Promise<void> | void;
  onPresigned?: (context: DownloadOnPresignedContext) => Promise<void> | void;
};

/** Delete feature. A config object (or `true`) enables the feature. */
export type DeleteConfig = KeyPolicy & {
  guard?: (context: DeleteGuardContext) => Promise<void> | void;
  onDeleted?: (context: DeleteOnDeletedContext) => Promise<void> | void;
};

/** Multipart feature. On automatically when upload is on, unless set to `false`. */
export type MultipartConfig = KeyPolicy &
  AclPolicy & {
    requireFileSize?: boolean;
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
 * Options for {@link dimahS3}.
 *
 * @example
 * ```ts
 * export const awsS3 = new S3Client({ ... });
 * export const s3 = dimahS3({
 *   client: awsS3,
 *   bucket: "my-bucket",
 *   upload: true,
 * });
 * ```
 */
export type DimahS3Config = {
  /** AWS SDK v3 `S3Client`. Export it as `awsS3` so scripts and a custom backend can reuse it. */
  client: S3Client;
  /**
   * Default bucket. Used when the request omits `bucket`, and whenever a
   * client-sent bucket is ignored (the default). Hooks may still send
   * `bucket`; it only wins with {@link allowClientBucket} or {@link buckets}.
   */
  bucket: string;
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
   * Keep disabled unless you need ACL inference in responses/hooks —
   * it adds one extra S3 request per upload confirmation.
   *
   * @default false
   */
  resolveObjectAcl?: boolean;
  /**
   * Allow the client to pick any bucket. Off by default — the request `bucket`
   * is ignored and {@link bucket} is used.
   *
   * Mutually exclusive with {@link buckets}.
   */
  allowClientBucket?: boolean;
  /**
   * Allowlist of buckets the client may send. When set, a request bucket
   * outside this list is rejected. {@link bucket} should be included.
   *
   * Mutually exclusive with {@link allowClientBucket}.
   */
  buckets?: string[];
  /**
   * Upper bound for client `expiresIn` (seconds). Requests above this are
   * clamped. The protocol maximum is 7 days (604800).
   * @default 604800
   */
  maxExpiresIn?: number;
  /** Runs before every operation. Throw to reject. */
  guard?: (context: GuardContext) => Promise<void> | void;
  upload?: FeatureToggle<UploadConfig>;
  download?: FeatureToggle<DownloadConfig>;
  delete?: FeatureToggle<DeleteConfig>;
  multipart?: FeatureToggle<MultipartConfig>;
  /**
   * Optional server plugins (e.g. `db()` from `@dimah-s3/db`).
   * Plugin hooks merge ahead of user hooks; contexts land on `s3.context[id]`
   * and are flattened onto the instance (`s3[id]`).
   */
  plugins?: readonly DimahS3Plugin[];
};

type ResolvedFeature<T> = T & { enabled: boolean };

/** Feature flags after {@link dimahS3} normalizes booleans and defaults. */
export type ResolvedDimahS3Config = Omit<
  DimahS3Config,
  "upload" | "download" | "delete" | "multipart" | "plugins"
> & {
  upload?: ResolvedFeature<UploadConfig>;
  download?: ResolvedFeature<DownloadConfig>;
  delete?: ResolvedFeature<DeleteConfig>;
  multipart?: ResolvedFeature<MultipartConfig>;
};
