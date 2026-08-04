import type { S3Client } from "@aws-sdk/client-s3";
import type { UploadPresignMethod } from "@dimah-s3/core";
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
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
  UploadOnPresignedContext,
  UploadPresignGuardContext,
} from "./hook-contexts";
import type { DimahS3Plugin } from "../plugin/types";

/** Upload feature. Set `enabled: true` to activate. */
export type UploadConfig = {
  enabled?: boolean;
  method?: UploadPresignMethod;
  requireFileSize?: boolean;
  presignGuard?: (context: UploadPresignGuardContext) => Promise<void> | void;
  onPresigned?: (context: UploadOnPresignedContext) => Promise<void> | void;
  confirmGuard?: (context: UploadConfirmGuardContext) => Promise<void> | void;
  onConfirmed?: (context: UploadOnConfirmedContext) => Promise<void> | void;
};

/** Download feature. Set `enabled: true` to activate. */
export type DownloadConfig = {
  enabled?: boolean;
  presignGuard?: (context: DownloadPresignGuardContext) => Promise<void> | void;
  onPresigned?: (context: DownloadOnPresignedContext) => Promise<void> | void;
};

/** Delete feature. Set `enabled: true` to activate. */
export type DeleteConfig = {
  enabled?: boolean;
  guard?: (context: DeleteGuardContext) => Promise<void> | void;
  onDeleted?: (context: DeleteOnDeletedContext) => Promise<void> | void;
};

/** Multipart feature. Off unless you need large files. */
export type MultipartConfig = {
  enabled?: boolean;
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

/**
 * Options for {@link dimahS3}.
 *
 * @example
 * ```ts
 * export const s3 = dimahS3({
 *   s3: s3Client,
 *   defaultBucket: "my-bucket",
 *   upload: { enabled: true },
 * });
 * ```
 */
export type DimahS3Config = {
  /** AWS SDK v3 S3Client. */
  s3: S3Client;
  /** Bucket when the request omits one. */
  defaultBucket: string;
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
  /** Runs before every operation. Throw to reject. */
  guard?: (context: GuardContext) => Promise<void> | void;
  upload?: UploadConfig;
  download?: DownloadConfig;
  delete?: DeleteConfig;
  multipart?: MultipartConfig;
  /**
   * Optional server plugins (e.g. `db()` from `@dimah-s3/db`).
   * Plugin hooks merge ahead of user hooks; contexts land on `s3.context[id]`
   * and are flattened onto the instance (`s3[id]`).
   */
  plugins?: readonly DimahS3Plugin[];
};
