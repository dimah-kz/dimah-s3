// Schema + client
export { DimahS3DB, v1 } from "./fuma-db";

// Types
export type {
  DbClientListInput,
  DbClientListResponse,
  DbClientObject,
  ScopeResolver,
  StorageObject,
  StorageObjectStatus,
} from "./types/storage-object";

// Errors
export { conflict, forbidden, notFound, unauthorized } from "./errors";

// Store (data-access layer)
export {
  createStorageObjectStore,
  toPendingMultipartResume,
} from "./store/storage-object-store";
export type {
  DimahS3DbClient,
  FindPendingMultipartInput,
  ListByScopeInput,
  MarkActiveInput,
  ObjectRef,
  PendingMultipartResume,
  ScopeUsage,
  StorageObjectStore,
  UpsertPendingInput,
} from "./store/storage-object-store";
export { mapStorageObjectRow } from "./store/map-row";
export type { StorageObjectRow } from "./store/map-row";

// Plugin
export { db } from "./plugin/db";
export type { DbPluginContext, DbPluginOptions } from "./plugin/db";

// Guards (escape hatch for custom composition)
export { createObjectAccessGuard } from "./hooks/create-object-access-guard";
export type {
  CreateObjectAccessGuardOptions,
  ObjectAccessGuardContext,
} from "./hooks/create-object-access-guard";

// Jobs
export { purgeStalePendingObjects } from "./jobs/purge-stale-pending";
export type {
  PurgeStalePendingOptions,
  PurgeStalePendingResult,
} from "./jobs/purge-stale-pending";
