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

export { definePlugin } from "./plugin";
export type {
  DimahS3Plugin,
  DimahS3PluginHooks,
  PluginContextMap,
  PluginEndpointMap,
  PluginInitEnv,
} from "./plugin";

export type {
  DimahS3Config,
  DimahS3RouteConfig,
  DownloadConfig,
  DeleteConfig,
  FeatureToggle,
  MultipartConfig,
  ObjectContext,
  ObjectFile,
  ObjectInfo,
  ResolvedDimahS3Config,
  ResolvedRoutePolicy,
  UploadConfig,
} from "./types";
