import type { S3Client } from "@aws-sdk/client-s3";
import type {
  ContentDispositionType,
  S3Api,
  S3ObjectAcl,
  S3RouteName,
  UploadPresignMethod,
} from "@dimah-s3/core";
import type {
  DeleteGuardContext,
  DeleteOnDeletedContext,
  DownloadGuardContext,
  DownloadOnPresignedContext,
  DownloadResolveContext,
  DownloadResolveInfo,
  GuardContext,
  MultipartGuardContext,
  MultipartOnAbortContext,
  RouteGuardContext,
  UploadConfirmGuardContext,
  UploadGuardContext,
  UploadObjectContext,
  UploadObjectInfo,
  UploadOnConfirmedContext,
  UploadOnStartContext,
} from "./hook-contexts";
import type {
  DimahS3Locals,
  DimahS3RoutePluginOptions,
  Guard,
  LifecycleHook,
} from "./locals";
import type { DimahS3Plugin } from "@/plugin/types";

/** `true` or an options object turns the feature on; omit it or pass `false` to keep it off. */
export type FeatureToggle<T> = boolean | T;

/** Optional structured logger on {@link DimahS3Config}. */
export type DimahS3Logger = {
  debug?: (message: string, ...args: unknown[]) => void;
  info?: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
  error?: (message: string, ...args: unknown[]) => void;
};

/**
 * Subject an upload ticket is bound to, such as a user or tenant id. A ticket
 * issued for one subject is rejected for another. Return `undefined` to
 * issue an unbound ticket.
 *
 * It runs after the instance and route guards, when a ticket is issued and
 * each time one is used, so `locals` holds only what those guards returned.
 * Feature guards such as `upload.guard` have not run yet.
 */
export type TicketSubject = (
  context: RouteGuardContext,
) => string | undefined | Promise<string | undefined>;

/**
 * Multipart uploads under `upload.multipart`. Init runs `upload.guard` and
 * `upload.onStart`. Complete runs `guard` (`action: "complete"`), then
 * `upload.confirmGuard` and `upload.onConfirmed`.
 */
export type MultipartConfig = {
  /**
   * Preferred part size in bytes. The server raises it when the file would
   * need more than 10,000 parts, and keeps it within S3's part limits.
   * @default 8388608 (8 MiB)
   */
  partSize?: number;
  /**
   * Seconds a multipart ticket stays valid. Abort accepts an expired ticket
   * for 7 more days.
   * @default 86400
   */
  ticketExpiresIn?: number;
  /** Authorizes part signing, list, abort and complete. Branch on `action` if needed. */
  guard?: Guard<MultipartGuardContext>;
  onAbort?: LifecycleHook<MultipartOnAbortContext>;
};

/** Upload feature: constraints, object identity and lifecycle hooks. */
export type UploadConfig = {
  /** HTML `accept` tokens (`image/*`, `.pdf`, `application/pdf`). */
  fileTypes?: string[];
  /** Largest file in bytes. Checked on the declared size and again after HeadObject. */
  maxFileSize?: number;
  /**
   * Server-owned object identity. Return `keyFolder` for a path segment
   * under the route `keyPrefix`, or `key` for the rest of the key, plus
   * optional S3 `metadata`, `acl`, `storageClass`, `cacheControl` and
   * `tagging`. The default key is `{keyPrefix}/{uuid}/{name}`.
   */
  object?: (
    context: UploadObjectContext,
  ) => UploadObjectInfo | void | Promise<UploadObjectInfo | void>;
  /**
   * ACL used when `object` does not return one.
   * @default "private"
   */
  acl?: S3ObjectAcl;
  /**
   * Presign verb. R2 has no presigned POST.
   * @default "PUT"
   */
  method?: UploadPresignMethod;
  /**
   * Presigned URL TTL in seconds, capped by the instance `maxExpiresIn`.
   * @default 600
   */
  expiresIn?: number;
  /**
   * Seconds after the URL expires during which confirm is still accepted.
   * @default 3600
   */
  confirmWindow?: number;
  /**
   * Require a SHA-256 `checksum` from the client and sign it into the
   * upload. `verifyContent` turns it on; `false` together with
   * `verifyContent` throws.
   */
  checksum?: boolean;
  /**
   * After confirm, read the first bytes of the object and check them against
   * the declared type. An upload without a type is checked against the type
   * its name gives (`x.png` is checked as `image/png`), since downloads serve
   * it inline as that type. A mismatch deletes the object and returns
   * `FILE_CONTENT_MISMATCH`.
   */
  verifyContent?: boolean;
  /** Opt-in multipart uploads. Off by default. */
  multipart?: FeatureToggle<MultipartConfig>;
  /** Presign, multipart init and `s3.put`. */
  guard?: Guard<UploadGuardContext>;
  /** Once the upload can begin. A throw cancels it. */
  onStart?: LifecycleHook<UploadOnStartContext>;
  /** Confirm and multipart complete, after HeadObject. A rejection deletes the object. */
  confirmGuard?: Guard<UploadConfirmGuardContext>;
  /**
   * After the object is verified. It runs at least once per upload: dedupe
   * on `uploadToken`. A plain `Error` returns `500` and keeps the object;
   * reject content in `confirmGuard` instead.
   */
  onConfirmed?: LifecycleHook<UploadOnConfirmedContext>;
};

/** Download feature. A config object, or `true`, turns it on. */
export type DownloadConfig = {
  /**
   * Largest presign TTL in seconds. A shorter client `expiresIn` is used as
   * is. `resolve` can choose another TTL, capped by the instance
   * `maxExpiresIn`.
   * @default 600
   */
  maxExpiresIn?: number;
  /** @default "attachment" */
  disposition?: ContentDispositionType;
  /**
   * MIME types, or `type/*` wildcards, that may open inline. Anything else
   * is sent as `attachment`. `false` never opens inline. The default is
   * `DEFAULT_INLINE_TYPES` from `@dimah-s3/core`, without `application/pdf`
   * in proxy mode.
   */
  inlineTypes?: readonly string[] | false;
  /**
   * `"presign"` returns an S3 URL. `"proxy"` returns a `/file` URL that
   * streams through the server.
   * @default "presign"
   */
  mode?: "presign" | "proxy";
  /** Per-request download options. Returned values override route defaults. */
  resolve?: (
    context: DownloadResolveContext,
  ) => DownloadResolveInfo | void | Promise<DownloadResolveInfo | void>;
  guard?: Guard<DownloadGuardContext>;
  onPresigned?: LifecycleHook<DownloadOnPresignedContext>;
};

/** Delete feature. A config object, or `true`, turns it on. */
export type DeleteConfig = {
  guard?: Guard<DeleteGuardContext>;
  onDeleted?: LifecycleHook<DeleteOnDeletedContext>;
};

/**
 * Named file route under {@link DimahS3Config.routes}. Upload, download,
 * delete and `upload.multipart` stay off until set.
 */
export type DimahS3RouteConfig = {
  /** Overrides the instance S3 client for this route. */
  client?: S3Client;
  /** Overrides the instance bucket for this route. */
  bucket?: string;
  /**
   * Object-key namespace. Defaults to the route name. Uploads write under
   * it, and every other operation rejects keys outside it (`KEY_INVALID`).
   * `false` removes the bound. This isolates routes; it does not check who
   * owns an object.
   */
  keyPrefix?: string | false;
  /** Runs before every operation on this route, after the instance guard. */
  guard?: Guard<RouteGuardContext>;
  /** Per-plugin options for this route. `{ db: false }` turns a plugin off. */
  plugins?: DimahS3RoutePluginOptions;
  upload?: FeatureToggle<UploadConfig>;
  download?: FeatureToggle<DownloadConfig>;
  delete?: FeatureToggle<DeleteConfig>;
};

/**
 * Options for `dimahS3()`.
 *
 * @example
 * ```ts
 * export const s3 = dimahS3({
 *   client: awsS3,
 *   bucket: "my-bucket",
 *   routes: {
 *     uploads: route({ upload: { fileTypes: ["image/*"], multipart: true } }),
 *   },
 * });
 * ```
 */
export type DimahS3Config = {
  /**
   * Default AWS SDK v3 `S3Client`. Required unless every route sets one. It
   * must set `requestChecksumCalculation: "WHEN_REQUIRED"`.
   */
  client?: S3Client;
  /** Default bucket. Required unless every route sets one. */
  bucket?: string;
  /**
   * API path prefix. Must match `createS3Client({ basePath })`.
   * @default "/api/s3"
   */
  basePath?: string;
  /**
   * Absolute API URL, such as `https://app.example.com/api/s3`. Its path
   * must equal `basePath` when both are set. Proxy download URLs use it,
   * and in-process calls without a `request` use it as their URL.
   */
  baseURL?: string;
  /**
   * Upload ticket secret, at least 32 characters. Pass an array to rotate:
   * the first value signs, and every value verifies. Defaults to the
   * `DIMAH_S3_SECRET` environment variable.
   */
  secret?: string | readonly string[];
  /** Binds upload tickets to a subject. Defaults to the first plugin that provides one. */
  ticketSubject?: TicketSubject;
  /**
   * Largest presign TTL in seconds for any route.
   * @default 604800
   */
  maxExpiresIn?: number;
  /**
   * Largest JSON request body in bytes, counted on the stream.
   * @default 1048576
   */
  maxRequestBodySize?: number;
  /** Logs config errors and unexpected failures. `false` silences the default `console` logger. */
  logger?: DimahS3Logger | false;
  /** Called with every unexpected failure before it becomes `500 INTERNAL_ERROR`. */
  onError?: (error: unknown, context: { request: Request }) => void;
  /** Runs before every operation, before route lookup. */
  guard?: Guard<GuardContext>;
  /** Server plugins, such as `db()` from `@dimah-s3/db`. */
  plugins?: readonly DimahS3Plugin[];
  /** Named file routes. At least one is required. */
  routes: Record<string, DimahS3RouteConfig>;
};

/** Options for in-process calls through `s3.api` and `s3.put`. */
export type S3ServerCallOptions = {
  /** Headers for the synthetic request. Ignored when `request` is set. */
  headers?: HeadersInit;
  /** Request that hooks see. Defaults to one built from `baseURL` (or `basePath`) and `headers`. */
  request?: Request;
  /** Trusted values that seed `locals` before guards run. Never read from HTTP. */
  locals?: Partial<DimahS3Locals>;
};

/** `s3.api`: the browser client's shape, plus {@link S3ServerCallOptions}. */
export type DimahS3Api = S3Api<S3ServerCallOptions>;

/** Input to `s3.put`. */
export type PutInput = {
  route: S3RouteName;
  name: string;
  type?: string;
  body: Blob | ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | string;
  /** Byte size. Required for a `ReadableStream`. */
  size?: number;
  /** S3 user metadata written on the object. */
  metadata?: Record<string, string>;
  /** Visible to hooks (for example the db folder). Never written to S3. */
  clientMetadata?: Record<string, string>;
};
