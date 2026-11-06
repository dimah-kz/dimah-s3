// `@dimah-s3/react`: hooks, the provider and types. The build marks this entry
// "use client". Plain functions ship from `@dimah-s3/react/engine`, and
// protocol helpers and `APIError` from `@dimah-s3/core`.

// ─── Provider and client ─────────────────────────────────────────────────────
export { S3Provider, useApi, type S3ProviderProps } from "./s3-provider";
export { createS3Client, type ReactS3Client } from "./create-s3-client";
/** Generated key map. Use it with `satisfies Partial<Translations>`. */
export type { Translations } from "./translations";

// ─── Hooks ───────────────────────────────────────────────────────────────────
export {
  useUpload,
  type DropTargetProps,
  type DropzoneInputProps,
  type DropzoneRootProps,
  type UploadPolicy,
  type UseUploadReturn,
} from "./hooks/use-upload";
export { useUploadLimit } from "./hooks/use-upload-limit";
export { useDownload } from "./hooks/use-download";
export { useFetchDownload } from "./hooks/use-fetch-download";
export { useDelete } from "./hooks/use-delete";
export {
  useObjectUrl,
  type UseObjectUrlOptions,
  type UseObjectUrlReturn,
} from "./hooks/use-object-url";
export {
  useRouteUploadPolicy,
  type CatalogLoadStatus,
  type UseRouteUploadPolicyOptions,
  type UseRouteUploadPolicyReturn,
} from "./hooks/use-route-upload-policy";
export {
  useObjectList,
  type UseObjectListReturn,
} from "./hooks/use-object-list";
export {
  useObjectListSelection,
  type ObjectListSelectionMode,
  type UseObjectListSelectionOptions,
  type UseObjectListSelectionReturn,
} from "./hooks/use-object-list-selection";

// ─── Formatters ──────────────────────────────────────────────────────────────
export {
  useFormatAcceptLabels,
  useFormatDate,
  useFormatError,
  useFormatEta,
  useFormatFileSize,
  useFormatNumber,
  useFormatSpeed,
  type DateInput,
} from "./helpers";

// ─── Types ───────────────────────────────────────────────────────────────────
export type * from "./types";
export type * from "./list/types";
export type {
  RouteUploadPolicy,
  RouteUploadPolicyOptions,
} from "./helpers/load-route-catalog";
export type { MemoryObjectSourceOptions } from "./list/memory-object-source";
export type { ObjectListLevel } from "./list/read-object-list-level";
