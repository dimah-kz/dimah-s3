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
  PluginInitEnv,
} from "./plugin";

// S3 helpers for plugins that track uploads, such as `db()`.
export { isAwsNotFound } from "./helpers/aws-errors";
export {
  deleteObjectIfMatch,
  type ConditionalDeleteInput,
} from "./helpers/best-effort";
export { readUploadMarker } from "./helpers/object-meta";
