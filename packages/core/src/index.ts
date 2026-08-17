export * from "./types";
export * from "./helpers";
export * from "./schema";
export {
  DimahS3Error,
  defineErrorCodes,
  isAPIError,
  isDimahS3Error,
  S3_ERROR_CODES,
  type DimahS3ErrorBody,
  type DimahS3ErrorParams,
  type DimahS3ErrorStatus,
  type S3ErrorCode,
} from "./error";
export {
  S3_API_BASE_PATH,
  normalizeS3ApiBasePath,
  S3_API_ROUTES,
} from "./routes";
export {
  createS3Client,
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
} from "./create-s3-client";
export {
  createS3Fetch,
  defineClientPlugin,
  pluginPath,
  RESERVED_CLIENT_KEYS,
} from "./plugin";
export type {
  ClientPluginMethodsMap,
  ReservedClientKey,
  S3ClientFetchOptions,
  S3ClientPlugin,
  S3Fetch,
} from "./plugin";
