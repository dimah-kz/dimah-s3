// `@dimah-s3/react/engine`: plain functions with no React import and no
// "use client" directive, so shared and server modules can use them.

// ─── Upload engine ───────────────────────────────────────────────────────────
export {
  uploadFile,
  uploadAbortReason,
  getUploadAbortKind,
  multipartResumeKey,
  DEFAULT_MULTIPART_THRESHOLD,
} from "./upload";
export type {
  UploadFileOptions,
  UploadTransport,
  S3ApiUploadTransport,
  RetryConfig,
  UploadAbortKind,
} from "./types/upload";

// ─── Stores ──────────────────────────────────────────────────────────────────
export { createLocalStorageStore, createMemoryStore } from "./store";
export type { StoredUpload, UploadStore } from "./types/upload-store";

// ─── Route policy ────────────────────────────────────────────────────────────
export {
  loadRouteCatalog,
  resolveRouteUploadPolicy,
  mergeRouteUploadPolicy,
  type RouteUploadPolicy,
  type RouteUploadPolicyOptions,
} from "./helpers/load-route-catalog";

// ─── Custom S3 API ───────────────────────────────────────────────────────────
export { defineApi } from "./api";

// ─── Object list ─────────────────────────────────────────────────────────────
export {
  memoryObjectSource,
  type MemoryObjectSourceOptions,
} from "./list/memory-object-source";
export {
  readObjectListLevel,
  type ObjectListLevel,
} from "./list/read-object-list-level";
export { objectListEntryKey, objectKeyOf } from "./list/entries";

// ─── Formatting ──────────────────────────────────────────────────────────────
export { formatAcceptLabels } from "./helpers/format-accept-labels";
export { formatSpeed } from "./helpers/format-speed";
export { formatUploadProgress } from "./helpers/format-upload-progress";
export { toTimestamp, type DateInput } from "./helpers/to-timestamp";
