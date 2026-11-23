/**
 * The plugin SDK: what a server plugin is built from. Everything here
 * follows semver with `@dimah-s3/server`.
 */
export { createS3Endpoint } from "./api/create-s3-endpoint";
export type {
  S3Endpoint,
  S3EndpointMethod,
  S3EndpointOptions,
} from "./api/create-s3-endpoint";
export { createS3Middleware } from "./api/create-s3-middleware";
export type { S3EndpointContext } from "./api/context";
export { isFeatureOn } from "./config/feature-toggle";
export { definePlugin } from "./plugin";
export type {
  DimahS3Plugin,
  DimahS3PluginHooks,
  PluginContextMap,
  PluginErrorCodes,
  PluginInitEnv,
  PluginOperationTarget,
  PluginRoute,
  PluginRouteOptions,
  PluginRunOperation,
} from "./plugin";
export type { PluginCall } from "./types/hook-contexts";

// S3 helpers for plugins that track uploads, such as `db()`.
export { isAwsNotFound } from "./helpers/aws-errors";
export {
  assertFileConstraints,
  type FileConstraints,
} from "./helpers/constraints";
export {
  deleteObjectIfMatch,
  type ConditionalDeleteInput,
} from "./helpers/best-effort";
export { readObjectMetadata, readUploadMarker } from "./helpers/object-meta";
export { assertStoredKey } from "./helpers/resolve-target";
