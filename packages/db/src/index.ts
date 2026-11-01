// Schema and FumaDB client
export {
  DB_SCHEMA_VERSION,
  DimahS3DB,
  v2,
  type DimahS3DbClient,
} from "./fuma-db";

// Plugin
export { db, type DbPluginContext } from "./plugin/db";
export type {
  PruneDeletedOptions,
  PurgeStaleOptions,
  PurgeStaleResult,
} from "./plugin/purge";
export type { DbFolders, DbObjects } from "./plugin/public-stores";
export type {
  AuthorizeContext,
  DbAttributesOptions,
  DbPluginOptions,
  DbQuotaOption,
  DbRouteOptions,
  ScopeContext,
  ScopeOperation,
} from "./types/plugin";

// Rows
export type {
  StorageFolder,
  StorageObject,
  StorageObjectStatus,
} from "./types/storage-object";
export type {
  DbClientFolder,
  DbClientObject,
  DbListSort,
  DbListSortField,
  DbQuota,
  DbUsage,
} from "./types/client";
export type { StandardSchemaV1 } from "./standard-schema";

// Store inputs and pages (`s3.db.objects`, `s3.db.folders`)
export type {
  ListObjectsInput,
  ListObjectsPage,
  ObjectFilter,
  ObjectRef,
  UpdateObjectInput,
} from "./store/object-store";
