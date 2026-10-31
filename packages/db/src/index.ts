// Schema and FumaDB client
export {
  DB_SCHEMA_VERSION,
  DimahS3DB,
  v2,
  type DimahS3DbClient,
} from "./fuma-db";

// Plugin
export { db, type DbPluginContext } from "./plugin/db";
export type { PruneDeletedOptions, PurgeStaleOptions } from "./plugin/purge";
export type {
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

// Stores (`s3.db.objects`, `s3.db.folders`)
export type { StorageFolderStore } from "./store/folder-store";
export type {
  ListObjectsInput,
  ListObjectsPage,
  MarkActiveInput,
  ObjectFilter,
  ObjectRef,
  StorageObjectStore,
  UpdateObjectInput,
  UpsertPendingInput,
} from "./store/object-store";
