export { dimahS3 } from "./dimah-s3";
export type { DimahS3, DimahS3Api, MultipartAliasApi } from "./dimah-s3";
export { route } from "./route";
export {
  DimahS3Error,
  errors,
  isAPIError,
  isDimahS3Error,
  isS3ErrorCode,
  S3_ERROR_CODES,
} from "./errors";
export type { ServerErrors } from "./errors";

export { createS3Endpoint, createS3Middleware } from "./api";
export type { S3EndpointContext } from "./api";

export { chainHooks, definePlugin } from "./plugin";
export type {
  DimahS3Plugin,
  DimahS3PluginHooks,
  PluginContextMap,
  PluginEndpointMap,
  PluginInitEnv,
} from "./plugin";

export { ROUTE_FEATURES, ROUTE_OPERATIONS } from "./types";
export { isFeatureOn } from "./helpers";
export type {
  DeleteConfig,
  DeleteGuardContext,
  DeleteOnDeletedContext,
  DimahS3Config,
  DimahS3RouteConfig,
  DisabledFeature,
  DownloadConfig,
  DownloadGuardContext,
  DownloadOnPresignedContext,
  EnabledFeature,
  EnabledUploadConfig,
  FeatureToggle,
  GuardContext,
  MultipartConfig,
  MultipartOnAbortContext,
  MultipartOnInitContext,
  MultipartOnListContext,
  MultipartGuardContext,
  MultipartUploadContext,
  ObjectFile,
  OpenedRoute,
  ResolvedDimahS3Config,
  ResolvedFeature,
  ResolvedRoute,
  ResolvedUploadConfig,
  RouteFeature,
  RouteGuardContext,
  RouteOperation,
  StoredObjectContext,
  UploadConfig,
  UploadConfirmGuardContext,
  UploadGuardContext,
  UploadObjectContext,
  UploadObjectInfo,
  UploadOnConfirmedContext,
  UploadOnPresignedContext,
} from "./types";
