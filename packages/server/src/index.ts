export { dimahS3 } from "./dimah-s3";
export type { DimahS3 } from "./dimah-s3";
export { DimahS3Error, errors } from "./errors";
export type { ServerErrors } from "./errors";
export { resolveObjectAcl } from "./helpers/resolve-object-acl";

export {
  createS3Endpoint,
  createS3Middleware,
  CORE_ENDPOINT_NAMES,
} from "./api";
export type { CoreEndpoints, S3EndpointContext } from "./api";

export {
  applyPlugins,
  chainHooks,
  definePlugin,
  FEATURE_HOOK_KEYS,
  RESERVED_PLUGIN_IDS,
} from "./plugin";
export type {
  AppliedPlugins,
  DimahS3Plugin,
  DimahS3PluginHooks,
  FeatureName,
  PluginContextMap,
  PluginEndpointMap,
  PluginInitEnv,
  ReservedPluginId,
} from "./plugin";

export type {
  DimahS3Config,
  UploadConfig,
  DownloadConfig,
  DeleteConfig,
  MultipartConfig,
  GuardContext,
  UploadPresignGuardContext,
  UploadOnPresignedContext,
  UploadConfirmGuardContext,
  UploadOnConfirmedContext,
  UploadOnUploadConfirmedContext,
  DownloadPresignGuardContext,
  DownloadOnPresignedContext,
  DeleteGuardContext,
  DeleteOnDeletedContext,
  MultipartUploadContext,
  MultipartInitGuardContext,
  MultipartGuardContext,
  MultipartPartGuardContext,
  MultipartCompleteGuardContext,
  MultipartAbortGuardContext,
  MultipartListGuardContext,
  MultipartOnInitContext,
  MultipartOnCompleteContext,
  MultipartOnAbortContext,
  MultipartOnListContext,
} from "./types";
