# @dimah-s3/react public API

Generated from the built declarations by `pnpm api:report`. Do not edit it by hand. CI fails when a build differs from it, so review its diff as a change to the public API.

- `@dimah-s3/react`: `index.d.ts`
- `@dimah-s3/react/engine`: `engine.d.ts`

## `api.d.ts`

```ts
import type { S3Api } from "@dimah-s3/core";
import type { S3ApiUploadTransport } from "./types/upload.js";
export declare function defineApi<TApi extends S3Api & S3ApiUploadTransport>(
  api: TApi,
): TApi;
```

## `create-s3-client.d.ts`

```ts
import {
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
  type S3ClientPlugin,
} from "@dimah-s3/core";
import type { ComponentType, ReactNode } from "react";
import { type S3ProviderProps } from "./s3-provider.js";
type BoundProviderProps = Omit<S3ProviderProps, "api"> & {
  children: ReactNode;
};
export type ReactS3Client<P extends readonly S3ClientPlugin[] = []> =
  CreateS3ClientResult<P> & {
    Provider: ComponentType<BoundProviderProps>;
    useApi: () => CreateS3ClientResult<P>;
  };
export declare function createS3Client<
  const P extends readonly S3ClientPlugin[] = [],
>(options?: CreateS3ClientOptions<P>): ReactS3Client<P>;
```

## `engine.d.ts`

```ts
export {
  uploadFile,
  uploadAbortReason,
  getUploadAbortKind,
  multipartResumeKey,
  mergeUploadRequest,
  DEFAULT_MULTIPART_THRESHOLD,
} from "./upload/index.js";
export type {
  UploadFileOptions,
  UploadRequestOptions,
  UploadEnginePhase,
  UploadResult,
  UploadTransport,
  S3ApiUploadTransport,
  RetryConfig,
  UploadAbortKind,
} from "./types/upload.js";
export type { TransferProgress } from "./types/operation.js";
export {
  createLocalStorageUploadStore,
  createMemoryUploadStore,
} from "./store/index.js";
export type { StoredUpload, UploadStore } from "./types/upload-store.js";
export {
  loadRouteCatalog,
  resolveRouteUploadPolicy,
  mergeRouteUploadPolicy,
  type RouteUploadPolicy,
  type RouteUploadPolicyOptions,
} from "./helpers/load-route-catalog.js";
export { defineApi } from "./api.js";
export {
  memoryObjectSource,
  type MemoryObjectSourceOptions,
} from "./list/memory-object-source.js";
export {
  readObjectListLevel,
  type ObjectListLevel,
} from "./list/read-object-list-level.js";
export { objectListEntryKey, objectKeyOf } from "./list/entries.js";
export type {
  ObjectListFile,
  ObjectListFolder,
  ObjectListPage,
  ObjectListQuery,
  ObjectListQueryInput,
  ObjectListSearchScope,
  ObjectListSort,
  ObjectListSource,
  ObjectListUsageData,
} from "./list/types.js";
export {
  formatAcceptLabels,
  type FormatAcceptLabelsOptions,
} from "./helpers/format-accept-labels.js";
export {
  formatFileSize,
  type FileSizeUnit,
  type FormatFileSizeOptions,
} from "./helpers/format-file-size.js";
export { truncateFileName } from "./helpers/truncate-file-name.js";
export { toTimestamp, type DateInput } from "./helpers/to-timestamp.js";
```

## `helpers/format-accept-labels.d.ts`

```ts
export type FormatAcceptLabelsOptions = {
  groups?: Readonly<Partial<Record<string, string>>>;
};
export declare function formatAcceptLabels(
  accept?: readonly string[],
  options?: FormatAcceptLabelsOptions,
): string[];
```

## `helpers/format-date.d.ts`

```ts
import { type DateInput } from "./to-timestamp.js";
export declare function useFormatDate(): (
  value: DateInput | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) => string;
```

## `helpers/format-error.d.ts`

```ts
export declare function useFormatError(): (error: unknown) => string;
```

## `helpers/format-file-size.d.ts`

```ts
export type FileSizeUnit = "B" | "KB" | "MB" | "GB" | "TB" | "PB" | "EB";
export type FormatFileSizeOptions = {
  locale?: string | readonly string[];
  units?: Partial<Record<FileSizeUnit, string>>;
};
export declare function formatFileSize(
  bytes: number,
  options?: FormatFileSizeOptions,
): string;
```

## `helpers/format-number.d.ts`

```ts
export declare function useFormatFileSize(): (bytes: number) => string;
export declare function useFormatNumber(): (value: number) => string;
```

## `helpers/index.d.ts`

```ts
export { useFormatAcceptLabels } from "./use-format-accept-labels.js";
export { useFormatError } from "./format-error.js";
export { useFormatEta } from "./use-format-eta.js";
export { useFormatSpeed } from "./use-format-speed.js";
export { useFormatFileSize, useFormatNumber } from "./format-number.js";
export { useFormatDate } from "./format-date.js";
export type { DateInput } from "./to-timestamp.js";
```

## `helpers/load-route-catalog.d.ts`

```ts
import type { RouteCatalogResponse, S3Api, S3RouteName } from "@dimah-s3/core";
export type RouteUploadPolicy = {
  accept?: string[];
  maxFileSize?: number;
  multipart: boolean;
  checksum: boolean;
};
export type RouteUploadPolicyOptions = {
  accept?: readonly string[];
  maxFileSize?: number;
  multipart?: boolean;
};
export declare function loadRouteCatalog(
  api: S3Api,
): Promise<RouteCatalogResponse>;
export declare function resolveRouteUploadPolicy(
  catalog: RouteCatalogResponse | null | undefined,
  route: S3RouteName,
): RouteUploadPolicy;
export declare function mergeRouteUploadPolicy(
  policy: RouteUploadPolicy,
  options: RouteUploadPolicyOptions,
): RouteUploadPolicy;
```

## `helpers/to-timestamp.d.ts`

```ts
export type DateInput = Date | string | number;
export declare function toTimestamp(
  value: DateInput | null | undefined,
): number | null;
```

## `helpers/truncate-file-name.d.ts`

```ts
export declare function truncateFileName(
  name: string,
  maxChars?: number,
): string;
```

## `helpers/use-format-accept-labels.d.ts`

```ts
export declare function useFormatAcceptLabels(): (
  accept?: readonly string[],
) => string[];
```

## `helpers/use-format-eta.d.ts`

```ts
import type { TransferProgress } from "../types/operation.js";
export declare function useFormatEta(): (
  progress: Pick<TransferProgress, "loaded" | "total" | "speed">,
) => string | null;
```

## `helpers/use-format-speed.d.ts`

```ts
export declare function useFormatSpeed(): (bytesPerSecond: number) => string;
```

## `hooks/use-delete.d.ts`

```ts
import type { UseDeleteOptions, UseDeleteReturn } from "../types/delete.js";
export declare function useDelete(options: UseDeleteOptions): UseDeleteReturn;
```

## `hooks/use-download.d.ts`

```ts
import type {
  UseDownloadOptions,
  UseDownloadReturn,
} from "../types/download.js";
export declare function useDownload(
  options: UseDownloadOptions,
): UseDownloadReturn;
```

## `hooks/use-fetch-download.d.ts`

```ts
import type {
  UseFetchDownloadOptions,
  UseFetchDownloadReturn,
} from "../types/download.js";
export declare function useFetchDownload(
  options: UseFetchDownloadOptions,
): UseFetchDownloadReturn;
```

## `hooks/use-file-intake.d.ts`

```ts
import { type HTMLAttributes, type InputHTMLAttributes } from "react";
import type { UploadCallOptions } from "../types/upload.js";
export type UploadCallInput = UploadCallOptions | (() => UploadCallOptions);
type DataAttributes = {
  [name: `data-${string}`]: unknown;
};
export type UploadRootProps = HTMLAttributes<HTMLElement> & DataAttributes;
export type UploadInputProps = InputHTMLAttributes<HTMLInputElement> &
  DataAttributes;
export type DropTargetProps = Pick<
  HTMLAttributes<HTMLElement>,
  "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop"
> & {
  "data-drag-active"?: boolean;
};
export type UseFileIntakeOptions = {
  accept?: readonly string[];
  maxFiles: number;
  disabled?: boolean;
  noClick?: boolean;
  noDrag?: boolean;
  noKeyboard?: boolean;
  onFiles: (files: File[], call: UploadCallOptions | undefined) => void;
};
export type UseFileIntakeReturn = {
  getRootProps: <T extends UploadRootProps>(
    props?: T,
    call?: UploadCallInput,
  ) => T;
  getDropTargetProps: <T extends object = DropTargetProps>(
    props?: T & DropTargetProps,
    call?: UploadCallInput,
  ) => T & DropTargetProps;
  getInputProps: <T extends UploadInputProps>(props?: T) => T;
  open: (call?: UploadCallOptions) => void;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
};
export declare function useFileIntake(
  options: UseFileIntakeOptions,
): UseFileIntakeReturn;
```

## `hooks/use-object-list-selection.d.ts`

```ts
import type { ObjectListEntry, ObjectListFolder } from "../list/types.js";
export type ObjectListSelectionMode = "single" | "multiple";
export type UseObjectListSelectionOptions<TItem> = {
  mode?: ObjectListSelectionMode;
  isSelectable?: (entry: ObjectListEntry<TItem>) => boolean;
  persist?: boolean;
  onSelectionChange?: (selected: readonly ObjectListEntry<TItem>[]) => void;
};
export type UseObjectListSelectionReturn<TItem> = {
  mode: ObjectListSelectionMode;
  persist: boolean;
  selected: readonly ObjectListEntry<TItem>[];
  selectedKeys: ReadonlySet<string>;
  selectedItems: readonly TItem[];
  selectedFolders: readonly ObjectListFolder[];
  count: number;
  isSelecting: boolean;
  allSelected: boolean;
  selectableCount: number;
  isSelected: (key: string) => boolean;
  canSelect: (entry: ObjectListEntry<TItem>) => boolean;
  toggle: (
    key: string,
    options?: {
      range?: boolean;
      value?: boolean;
    },
  ) => void;
  select: (keys: string | readonly string[]) => void;
  deselect: (keys: string | readonly string[]) => void;
  selectAll: () => void;
  clear: () => void;
};
type SelectionSource<TItem> = {
  entries: readonly ObjectListEntry<TItem>[];
  parent: string | null;
  deleteFolder?: unknown;
  canMove?: (kind: ObjectListEntry<TItem>["kind"]) => boolean;
};
export declare function useObjectListSelection<TItem>(
  list: SelectionSource<TItem>,
  options?: UseObjectListSelectionOptions<TItem>,
): UseObjectListSelectionReturn<TItem>;
```

## `hooks/use-object-list.d.ts`

```ts
import { type APIError } from "@dimah-s3/core";
import type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFolder,
  ObjectListMoveResult,
  ObjectListSearchScope,
  ObjectListSort,
  ObjectListStatus,
  ObjectListUsageData,
  UseObjectListOptions,
} from "../list/types.js";
import type { UploadRequestOptions } from "../types/upload.js";
export type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFileEntry,
  ObjectListFolder,
  ObjectListFolderEntry,
  ObjectListMoveResult,
  ObjectListPage,
  ObjectListQuery,
  ObjectListQueryInput,
  ObjectListSearchScope,
  ObjectListSort,
  ObjectListSortDirection,
  ObjectListSource,
  ObjectListStatus,
  ObjectListUsageData,
  UseObjectListOptions,
} from "../list/types.js";
type Updater<T> = T | ((current: T) => T);
export type UseObjectListReturn<TItem> = {
  entries: readonly ObjectListEntry<TItem>[];
  items: readonly TItem[];
  folders: readonly ObjectListFolder[];
  trail: readonly ObjectListFolder[];
  parent: string | null;
  sort: ObjectListSort | null;
  search: string;
  isSearching: boolean;
  searchScope: ObjectListSearchScope;
  searchScopes: readonly ObjectListSearchScope[];
  total: number | null;
  usage: ObjectListUsageData | null;
  error: APIError | null;
  status: ObjectListStatus;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  openFolder: (folder: ObjectListFolder) => void;
  navigate: (trail: readonly ObjectListFolder[]) => void;
  goUp: () => void;
  setSort: (sort: ObjectListSort | null) => void;
  setSearch: (search: string) => void;
  setSearchScope: (scope: ObjectListSearchScope) => void;
  setItems: (items: Updater<readonly TItem[]>) => void;
  setFolders: (folders: Updater<readonly ObjectListFolder[]>) => void;
  removeItems: (ids: readonly string[]) => void;
  getId: (item: TItem) => string;
  getFile: (item: TItem) => ObjectListFile;
  uploadOptions: ((parent: string | null) => UploadRequestOptions) | undefined;
  listFolders: (
    parent: string | null,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<readonly ObjectListFolder[]>;
  createFolder:
    | ((
        name: string,
        options?: {
          parent?: string | null;
        },
      ) => Promise<ObjectListFolder>)
    | undefined;
  renameFile:
    ((item: TItem, name: string) => Promise<TItem | void>) | undefined;
  renameFolder:
    | ((
        folder: ObjectListFolder,
        name: string,
      ) => Promise<ObjectListFolder | void>)
    | undefined;
  canMove: (
    entry: ObjectListEntry<TItem> | ObjectListEntry<TItem>["kind"],
  ) => boolean;
  moveEntries:
    | ((
        entries: readonly ObjectListEntry<TItem>[],
        parent: string | null,
      ) => Promise<ObjectListMoveResult<TItem>>)
    | undefined;
  listFolderKeys:
    | ((
        folder: ObjectListFolder,
        options?: {
          signal?: AbortSignal;
        },
      ) => Promise<readonly string[]>)
    | undefined;
  deleteFolder: ((folder: ObjectListFolder) => Promise<void>) | undefined;
};
export declare function useObjectList<TItem>(
  options: UseObjectListOptions<TItem>,
): UseObjectListReturn<TItem>;
```

## `hooks/use-object-url.d.ts`

```ts
import type {
  APIError,
  ContentDispositionType,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
export type UseObjectUrlOptions = {
  api?: S3Api;
  route: S3RouteName;
  objectKey?: string | null;
  disposition?: ContentDispositionType;
  fileName?: string;
  refreshBeforeMs?: number;
};
export type UseObjectUrlReturn = {
  objectKey: string | null;
  url: string | null;
  expiresAt: number | null;
  error: APIError | null;
  isLoading: boolean;
  refresh: () => void;
};
export declare function useObjectUrl(
  options: UseObjectUrlOptions,
): UseObjectUrlReturn;
```

## `hooks/use-route-upload-policy.d.ts`

```ts
import type { APIError, S3Api, S3RouteName } from "@dimah-s3/core";
import {
  type RouteUploadPolicy,
  type RouteUploadPolicyOptions,
} from "../helpers/load-route-catalog.js";
export type CatalogLoadStatus = "loading" | "ready" | "error";
export type UseRouteUploadPolicyOptions = RouteUploadPolicyOptions & {
  api?: S3Api;
  route: S3RouteName;
};
export type UseRouteUploadPolicyReturn = RouteUploadPolicy & {
  status: CatalogLoadStatus;
  error: APIError | null;
};
export declare function useRouteUploadPolicy(
  options: UseRouteUploadPolicyOptions,
): UseRouteUploadPolicyReturn;
export declare function useRouteUploadPolicyState(
  options: UseRouteUploadPolicyOptions,
): [policy: UseRouteUploadPolicyReturn, reload: () => void];
```

## `hooks/use-upload-limit.d.ts`

```ts
import type { UploadLimit } from "../types/upload.js";
import type { UseUploadReturn } from "./use-upload.js";
export declare function useUploadLimit(
  upload: Pick<UseUploadReturn, "instanceId" | "files">,
  limit: UploadLimit | null,
): number | null;
```

## `hooks/use-upload.d.ts`

```ts
import type { APIError } from "@dimah-s3/core";
import type { TransferProgress } from "../types/operation.js";
import type {
  FileRejection,
  UploadBatchResult,
  UploadCallOptions,
  UploadFileState,
  UploadPhase,
  UseUploadOptions,
} from "../types/upload.js";
import {
  type DropTargetProps,
  type UploadCallInput,
  type UploadInputProps,
  type UploadRootProps,
} from "./use-file-intake.js";
import { type UseRouteUploadPolicyReturn } from "./use-route-upload-policy.js";
export type {
  DropTargetProps,
  UploadCallInput,
  UploadInputProps,
  UploadRootProps,
};
export type { FileRejection, UseUploadOptions } from "../types/upload.js";
export type UploadPolicy = UseRouteUploadPolicyReturn & {
  maxFiles: number;
};
export type UseUploadReturn = {
  instanceId: string;
  files: readonly UploadFileState[];
  file: UploadFileState | null;
  phase: UploadPhase;
  progress: TransferProgress;
  error: APIError | null;
  isPending: boolean;
  policy: UploadPolicy;
  resumable: boolean;
  disabled: boolean;
  handleFiles: (
    files: FileList | readonly File[] | File | null,
    call?: UploadCallOptions,
  ) => Promise<UploadBatchResult>;
  open: (call?: UploadCallOptions) => void;
  retry: (ids?: string | readonly string[]) => Promise<UploadBatchResult>;
  pause: (ids?: string | readonly string[]) => void;
  resume: (ids?: string | readonly string[]) => void;
  cancel: (ids?: string | readonly string[]) => void;
  detach: () => void;
  reset: (ids?: string | readonly string[]) => void;
  getRootProps: <T extends UploadRootProps>(
    props?: T,
    call?: UploadCallInput,
  ) => T;
  getDropTargetProps: <T extends object = DropTargetProps>(
    props?: T & DropTargetProps,
    call?: UploadCallInput,
  ) => T & DropTargetProps;
  getInputProps: <T extends UploadInputProps>(props?: T) => T;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  fileRejections: readonly FileRejection[];
};
export declare function useUpload(options: UseUploadOptions): UseUploadReturn;
```

## `index.d.ts`

```ts
export {
  S3Provider,
  useS3Api,
  type S3ErrorFormatter,
  type S3ProviderProps,
} from "./s3-provider.js";
export { createS3Client, type ReactS3Client } from "./create-s3-client.js";
export type { Translations } from "./translations/index.js";
export {
  useUpload,
  type DropTargetProps,
  type UploadCallInput,
  type UploadInputProps,
  type UploadPolicy,
  type UploadRootProps,
  type UseUploadReturn,
} from "./hooks/use-upload.js";
export { useUploadLimit } from "./hooks/use-upload-limit.js";
export { useDownload } from "./hooks/use-download.js";
export { useFetchDownload } from "./hooks/use-fetch-download.js";
export { useDelete } from "./hooks/use-delete.js";
export {
  useObjectUrl,
  type UseObjectUrlOptions,
  type UseObjectUrlReturn,
} from "./hooks/use-object-url.js";
export {
  useRouteUploadPolicy,
  type CatalogLoadStatus,
  type UseRouteUploadPolicyOptions,
  type UseRouteUploadPolicyReturn,
} from "./hooks/use-route-upload-policy.js";
export {
  useObjectList,
  type UseObjectListReturn,
} from "./hooks/use-object-list.js";
export {
  useObjectListSelection,
  type ObjectListSelectionMode,
  type UseObjectListSelectionOptions,
  type UseObjectListSelectionReturn,
} from "./hooks/use-object-list-selection.js";
export {
  useFormatAcceptLabels,
  useFormatDate,
  useFormatError,
  useFormatEta,
  useFormatFileSize,
  useFormatNumber,
  useFormatSpeed,
  type DateInput,
} from "./helpers/index.js";
export type * from "./types/index.js";
export type * from "./list/types.js";
export type {
  RouteUploadPolicy,
  RouteUploadPolicyOptions,
} from "./helpers/load-route-catalog.js";
export type { MemoryObjectSourceOptions } from "./list/memory-object-source.js";
export type { ObjectListLevel } from "./list/read-object-list-level.js";
```

## `list/entries.d.ts`

```ts
import type {
  ObjectListEntry,
  ObjectListFile,
  ObjectListFolder,
} from "./types.js";
export declare function objectListEntryKey(
  kind: ObjectListEntry<unknown>["kind"],
  id: string,
): string;
export declare function createObjectListEntries<TItem>(
  folders: readonly ObjectListFolder[],
  items: readonly TItem[],
  getId: (item: TItem) => string,
  getFile: (item: TItem) => ObjectListFile,
): ObjectListEntry<TItem>[];
export type ObjectListEntryCache<TItem> = {
  folders: readonly ObjectListFolder[];
  items: readonly TItem[];
  entries: readonly ObjectListEntry<TItem>[];
};
export declare function reuseObjectListEntries<TItem>(
  previous: ObjectListEntryCache<TItem> | null,
  folders: readonly ObjectListFolder[],
  items: readonly TItem[],
  getId: (item: TItem) => string,
  getFile: (item: TItem) => ObjectListFile,
): ObjectListEntryCache<TItem>;
export declare function objectKeyOf(entry: {
  id: string;
  file: Pick<ObjectListFile, "objectKey">;
}): string;
```

## `list/memory-object-source.d.ts`

```ts
import type { ObjectListFile, ObjectListSource } from "./types.js";
type SortValue = string | number | null | undefined;
export type MemoryObjectSourceOptions<TItem> = {
  getId: (item: TItem) => string;
  getFile: (item: TItem) => ObjectListFile;
  getFolder?: (item: TItem) => string | null | undefined;
  pageSize?: number;
  usage?: boolean;
  limits?: {
    maxBytes?: number;
    maxFiles?: number;
  };
  matches?: (item: TItem, search: string) => boolean;
  sortValue?: (item: TItem, field: string) => SortValue;
};
export declare function memoryObjectSource<TItem>(
  records: readonly TItem[] | (() => readonly TItem[]),
  options: MemoryObjectSourceOptions<TItem>,
): ObjectListSource<TItem> & {
  getFile: (item: TItem) => ObjectListFile;
};
```

## `list/read-object-list-level.d.ts`

```ts
import type { ObjectListFolder } from "./types.js";
export type ObjectListLevel<TItem> = {
  folders: ObjectListFolder[];
  items: TItem[];
};
export declare function readObjectListLevel<TItem>(
  records: readonly TItem[],
  input: {
    parent: string | null;
    getFolder: (record: TItem) => string | null | undefined;
  },
): ObjectListLevel<TItem>;
export declare function normalizeFolder(
  folder: string | null | undefined,
): string | null;
```

## `list/types.d.ts`

```ts
import type { APIError } from "@dimah-s3/core";
import type { UploadRequestOptions } from "../types/upload.js";
export type ObjectListUsageData = {
  totalBytes: number;
  objectCount: number;
  maxBytes?: number;
  maxFiles?: number;
};
export type ObjectListFolder = {
  id: string;
  name: string;
  location?: readonly ObjectListFolder[];
  size?: number;
  objectCount?: number;
};
export type ObjectListSearchScope = "folder" | "all";
export type ObjectListFile = {
  name: string;
  objectKey?: string | null;
  size?: number | null;
  contentType?: string | null;
  updatedAt?: Date | string | number | null;
  previewUrl?: string | null;
  location?: readonly ObjectListFolder[] | null;
};
export type ObjectListSortDirection = "asc" | "desc";
export type ObjectListSort = {
  field: string;
  direction: ObjectListSortDirection;
};
export type ObjectListQueryInput = {
  parent: string | null;
  cursor: string | null;
  sort: ObjectListSort | null;
  search: string;
  searchScope: ObjectListSearchScope;
  signal: AbortSignal;
};
export type ObjectListPage<TItem> = {
  items: readonly TItem[];
  folders?: readonly ObjectListFolder[];
  trail?: readonly ObjectListFolder[];
  nextCursor?: string | null;
  usage?: ObjectListUsageData;
  total?: number;
};
export type ObjectListQuery<TItem> = (
  input: ObjectListQueryInput,
) => Promise<ObjectListPage<TItem>>;
export type ObjectListSource<TItem> = {
  query: ObjectListQuery<TItem>;
  searchScopes?: readonly ObjectListSearchScope[];
  getId: (item: TItem) => string;
  getFile?: (item: TItem) => ObjectListFile;
  uploadOptions?: (parent: string | null) => UploadRequestOptions;
  createFolder?: (input: {
    parent: string | null;
    name: string;
  }) => Promise<ObjectListFolder>;
  renameFile?: (input: { item: TItem; name: string }) => Promise<TItem | void>;
  renameFolder?: (input: {
    folder: ObjectListFolder;
    name: string;
  }) => Promise<ObjectListFolder | void>;
  moveFile?: (input: { item: TItem; parent: string | null }) => Promise<void>;
  moveFolder?: (input: {
    folder: ObjectListFolder;
    parent: string | null;
  }) => Promise<void>;
  listFolderKeys?: (input: {
    folder: ObjectListFolder;
    signal: AbortSignal;
  }) => Promise<readonly string[]>;
  deleteFolder?: (input: { folder: ObjectListFolder }) => Promise<void>;
};
export type ObjectListMoveResult<TItem> = {
  moved: readonly ObjectListEntry<TItem>[];
  failed: readonly {
    entry: ObjectListEntry<TItem>;
    error: APIError;
  }[];
};
export type ObjectListFolderEntry = {
  kind: "folder";
  key: string;
  id: string;
  name: string;
  folder: ObjectListFolder;
  location?: readonly ObjectListFolder[];
};
export type ObjectListFileEntry<TItem> = {
  kind: "file";
  key: string;
  id: string;
  name: string;
  item: TItem;
  file: ObjectListFile;
  location?: readonly ObjectListFolder[];
};
export type ObjectListEntry<TItem> =
  ObjectListFolderEntry | ObjectListFileEntry<TItem>;
export type ObjectListStatus =
  "idle" | "loading" | "refreshing" | "loading-more" | "ready" | "error";
export type UseObjectListOptions<TItem> = ObjectListSource<TItem> & {
  parent?: string | null;
  onParentChange?: (parent: string | null) => void;
  defaultParent?: string | null;
  defaultTrail?: readonly ObjectListFolder[];
  sort?: ObjectListSort | null;
  onSortChange?: (sort: ObjectListSort | null) => void;
  defaultSort?: ObjectListSort | null;
  search?: string;
  onSearchChange?: (search: string) => void;
  defaultSearch?: string;
  searchScope?: ObjectListSearchScope;
  onSearchScopeChange?: (scope: ObjectListSearchScope) => void;
  defaultSearchScope?: ObjectListSearchScope;
  queryKey?: readonly unknown[];
  enabled?: boolean;
};
```

## `s3-provider.d.ts`

```ts
import { type ReactNode } from "react";
import type { APIError, S3Api } from "@dimah-s3/core";
import type { Translations } from "./translations/types.js";
export declare const S3Context: import("react").Context<S3Api | null>;
export declare const S3LocaleContext: import("react").Context<
  string | undefined
>;
export type S3ErrorFormatter = (error: APIError) => string | undefined;
export declare const S3FormatErrorContext: import("react").Context<
  S3ErrorFormatter | undefined
>;
export type S3ProviderProps<TApi extends S3Api = S3Api> = {
  api: TApi;
  translations?: Partial<Translations>;
  locale?: string;
  formatError?: S3ErrorFormatter;
  children: ReactNode;
};
export declare function S3Provider<TApi extends S3Api>({
  api,
  translations,
  locale,
  formatError,
  children,
}: S3ProviderProps<TApi>): import("react").JSX.Element;
export declare function useS3Api<TApi extends S3Api = S3Api>(): TApi;
```

## `store/index.d.ts`

```ts
export type { StoredUpload, UploadStore } from "../types/upload-store.js";
export { createLocalStorageUploadStore } from "./local-storage-store.js";
export { createMemoryUploadStore } from "./memory-store.js";
```

## `store/local-storage-store.d.ts`

```ts
import type { UploadStore } from "../types/upload-store.js";
export declare function createLocalStorageUploadStore(): UploadStore;
```

## `store/memory-store.d.ts`

```ts
import type { UploadStore } from "../types/upload-store.js";
export declare function createMemoryUploadStore(): UploadStore;
```

## `translations/index.d.ts`

```ts
export type { Translations } from "./types.js";
```

## `translations/types.d.ts`

```ts
export type Translations = {
  ", (list separator)": string;
  "1 day(share link expiry)": string;
  "1 download left(shared view)": string;
  "1 download(share link facts)": string;
  "1 file(object list usage)": string;
  "1 hour(share link expiry)": string;
  "1 minute(share link expiry)": string;
  "1 result(object list search)": string;
  "1 view(share link facts)": string;
  "A file checksum is required(API error)": string;
  "A file with this name already exists(API error)": string;
  "A folder cannot move into itself.(object list move)": string;
  "A folder with this name already exists(API error)": string;
  "A folder with this name already exists(object list new folder)": string;
  "Accepted {types}.(dropzone hint)": string;
  "Access denied(API error)": string;
  "Actions for {name}(object list menu)": string;
  "Active(share link status)": string;
  "All {count} files uploaded(upload status)": string;
  "An uploaded part was not found(API error)": string;
  "Another change happened at the same time. Try again.(API error)": string;
  "Anyone who has this link can no longer open it.(share link dialog)": string;
  "Anyone with a link can download this file until the link expires or you turn it off.(share link dialog)": string;
  "Anyone with a link can open this folder and download its files until the link expires or you turn it off.(share link dialog)": string;
  'Are you sure you want to delete "{name}" and everything in it? This action cannot be undone.(dialog description)': string;
  'Are you sure you want to delete "{name}"? This action cannot be undone.(dialog description)': string;
  "Ascending(object list sort)": string;
  "Audio(file type group)": string;
  "B(file size unit)": string;
  "Cancel all uploads(upload control)": string;
  "Cancel download of {name}(download control)": string;
  "Cancel {name}(attachment action)": string;
  "Cancel(dialog button)": string;
  "Cancel(download control)": string;
  "Cancel(object list new folder)": string;
  "Cancel(object list rename)": string;
  "Cancel(toast action)": string;
  "Change link(share link dialog)": string;
  "Clear search(object list)": string;
  "Clear(object list selection)": string;
  "Close search(object list)": string;
  "Close(dialog button)": string;
  "Copied(share link dialog)": string;
  "Copy link(object list menu)": string;
  "Copy link(share link dialog)": string;
  "Could not copy link(object list menu)": string;
  "Could not copy the link(share link dialog)": string;
  "Could not copy the link. Select it and copy it yourself.(share link dialog)": string;
  "Could not create link(object list menu)": string;
  'Could not delete "{name}"(toast)': string;
  "Could not delete {count} files(toast)": string;
  "Could not delete {count} folders(toast)": string;
  "Could not load files(object list)": string;
  'Could not move "{name}"(object list move)': string;
  "Could not move {count} items(object list move)": string;
  "Could not reach storage ({code})(API error)": string;
  "Could not reach storage(API error)": string;
  "Create folder(object list new folder)": string;
  "Create link(share link dialog)": string;
  "Delete failed(toast)": string;
  "Delete file?(dialog title)": string;
  "Delete folder?(dialog title)": string;
  "Delete {count} files?(dialog title)": string;
  "Delete {count} items?(dialog title)": string;
  "Delete {name}(attachment action)": string;
  "Delete(button)": string;
  "Delete(dialog confirm)": string;
  "Deleted {count} files(toast)": string;
  "Deleted {count} folders(toast)": string;
  "Deleting is disabled(API error)": string;
  "Deleting…(delete status)": string;
  "Descending(object list sort)": string;
  "Dismiss {name}(attachment action)": string;
  "Dismiss(attachment action)": string;
  'Download "{name}"(shared view)': string;
  "Download cancelled(toast)": string;
  "Download complete(toast)": string;
  "Download failed(API error)": string;
  "Download failed(toast)": string;
  "Download limit(share link field)": string;
  "Download link is invalid or has expired(API error)": string;
  "Download started(toast)": string;
  "Download {name}(attachment action)": string;
  "Download(button)": string;
  "Download(shared view)": string;
  "Downloading(toast)": string;
  "Downloads are disabled(API error)": string;
  "Drag and drop a file here(dropzone)": string;
  "Drag and drop files here(dropzone)": string;
  "Drop files here to add them to this folder.(object list)": string;
  "Drop to upload into this folder(object list)": string;
  "Drop to upload into {name}(object list)": string;
  "Drop to upload(dropzone)": string;
  "EB(file size unit)": string;
  "Each up to {size}.(dropzone hint)": string;
  "Enter a file name(object list rename)": string;
  "Enter a folder name(object list new folder)": string;
  "Enter a folder name(object list rename)": string;
  "Expired {date}(share link facts)": string;
  "Expired(share link status)": string;
  "Expires after(share link field)": string;
  "Expires in 1 day(share link)": string;
  "Expires in 1 hour(share link)": string;
  "Expires in 1 minute(share link)": string;
  "Expires in 1 second(share link)": string;
  "Expires in {count} days(share link)": string;
  "Expires in {count} hours(share link)": string;
  "Expires in {count} minutes(share link)": string;
  "Expires in {count} seconds(share link)": string;
  "Expires {date}(share link facts)": string;
  "Failed(attachment status)": string;
  "File actions(object list menu)": string;
  "File changed during upload(API error)": string;
  "File content does not match its type(API error)": string;
  "File deleted(toast)": string;
  "File is empty(API error)": string;
  "File is too large(API error)": string;
  "File limit reached(API error)": string;
  "File name(object list rename)": string;
  "File not accepted(toast)": string;
  "File not found(API error)": string;
  "File size exceeds {size} limit(API error)": string;
  'File type "{type}" is not allowed(API error)': string;
  "File type is not allowed(API error)": string;
  "Files and folders you add here will show up in this list.(object list)": string;
  "Files(object list)": string;
  "Finishing…(upload status)": string;
  "Folder actions(object list menu)": string;
  "Folder deleted(toast)": string;
  "Folder is not empty(API error)": string;
  "Folder limit reached(API error)": string;
  "Folder links are turned off(API error)": string;
  "Folder name is invalid(API error)": string;
  "Folder name(object list new folder)": string;
  "Folder name(object list rename)": string;
  "Folder not found(API error)": string;
  "Folder path(object list)": string;
  "Folders above(object list)": string;
  "Folders are deleted with everything in them. This action cannot be undone.(dialog description)": string;
  "Folders(object list move)": string;
  "Fonts(file type group)": string;
  "GB(file size unit)": string;
  "Grid view(object list)": string;
  "Images(file type group)": string;
  "Invalid request(API error)": string;
  "KB(file size unit)": string;
  "Keep the current expiry(share link field)": string;
  "Keep the current password(share link field)": string;
  "Large uploads are disabled(API error)": string;
  "Last opened {date}(share link facts)": string;
  "Limit reached(share link status)": string;
  "Link changed(share link dialog)": string;
  "Link copied(object list menu)": string;
  "Link copied(share link dialog)": string;
  "Link created and copied(share link dialog)": string;
  "Link created(share link dialog)": string;
  "Link not found(API error)": string;
  "Link turned off(share link dialog)": string;
  "Links ({count})(share link dialog)": string;
  "Links(share link dialog)": string;
  "List view(object list)": string;
  "Load more(object list)": string;
  "Loading files(object list)": string;
  "Loading folders(object list move)": string;
  "Loading links(share link dialog)": string;
  "MB(file size unit)": string;
  "Maximum files reached.(dropzone hint)": string;
  "Modified(object list sort)": string;
  'Move "{name}"(object list move)': string;
  "Move here(object list move)": string;
  "Move to…(object list menu)": string;
  "Move {count} items(object list move)": string;
  "Move(object list selection)": string;
  'Moved "{name}" to "{folder}"(object list move)': string;
  'Moved {count} items to "{folder}"(object list move)': string;
  "Moving(object list move)": string;
  "Name(object list sort)": string;
  "Needs a password(share link facts)": string;
  "Network error(API error)": string;
  "Never expires(share link expiry)": string;
  "New folder(object list)": string;
  "New link(share link dialog)": string;
  "New password(share link field)": string;
  "No downloads left(shared view)": string;
  "No folders here(object list move)": string;
  "No limit(share link field)": string;
  "No links yet.(share link dialog)": string;
  "No results(object list)": string;
  "Not found(API error)": string;
  "Note(share link field)": string;
  "Nothing in this folder matches “{search}”.(object list)": string;
  "Nothing in “{folder}” or its folders matches “{search}”.(object list search)": string;
  "Nothing matches “{search}”.(object list search)": string;
  "Nothing to delete(object list selection)": string;
  "Object key is invalid(API error)": string;
  "Open a folder, then move here.(object list move)": string;
  "Open until {date}(shared view)": string;
  "Open(shared view)": string;
  "Opening the link(shared view)": string;
  "Optional(share link field)": string;
  "PB(file size unit)": string;
  "Password(share link field)": string;
  "Pause(upload control)": string;
  "Paused(upload status)": string;
  "Preparing…(upload status)": string;
  "Progress for {name}(progress)": string;
  "Remove the password(share link field)": string;
  "Remove {name}(attachment action)": string;
  "Rename(object list menu)": string;
  "Request format is not supported(API error)": string;
  "Request is too large(API error)": string;
  "Requested range is not available(API error)": string;
  "Resume {name}(attachment action)": string;
  "Resume(toast action)": string;
  "Resume(upload control)": string;
  "Retry failed uploads(upload control)": string;
  "Retry {name}(attachment action)": string;
  "Retry(object list)": string;
  "Retry(toast action)": string;
  "Save name(object list rename)": string;
  "Save(share link dialog)": string;
  "Search all files(object list search)": string;
  "Search everywhere(object list search)": string;
  "Search files(object list)": string;
  "Search in “{folder}”(object list search)": string;
  "Search in(object list search)": string;
  "Searching(object list search)": string;
  "Searching…(object list search)": string;
  "Select all(object list selection)": string;
  "Select this page(object list selection)": string;
  "Select {name}(object list selection)": string;
  "Selected folders stay in the list.(object list selection)": string;
  'Share "{name}"(share link dialog)': string;
  "Share(share link dialog)": string;
  "Shared with you(shared view)": string;
  "Show in folder(object list menu)": string;
  "Show more(share link dialog)": string;
  "Size(object list sort)": string;
  "Some operations failed(API error)": string;
  "Something went wrong(API error)": string;
  "Sort(object list sort)": string;
  "Starting…(download progress)": string;
  "Storage quota exceeded(API error)": string;
  "Streaming downloads are disabled(API error)": string;
  "TB(file size unit)": string;
  "Text files(file type group)": string;
  "The file has changed(API error)": string;
  "The shared item is no longer available(API error)": string;
  "The shared item was deleted.(share link facts)": string;
  "These files cannot be uploaded(dropzone)": string;
  "These files cannot be uploaded(object list)": string;
  "This action cannot be undone.(dialog description)": string;
  "This feature is disabled(API error)": string;
  "This file needs a password(shared view)": string;
  "This folder is empty(object list)": string;
  "This folder needs a password(shared view)": string;
  "This link has expired(API error)": string;
  "This link needs a password(API error)": string;
  "This link reached its download limit(API error)": string;
  "This link was turned off(API error)": string;
  "This link works while you can access this file.(share link)": string;
  "Too many files (max {maxFiles})(API error)": string;
  "Too many files(API error)": string;
  "Too many requests. Try again later.(API error)": string;
  "Try again(object list move)": string;
  "Try again(share link dialog)": string;
  "Try again(shared view)": string;
  "Turn off link(share link dialog)": string;
  "Turn off this link?(share link dialog)": string;
  "Turn off(share link dialog)": string;
  "Turned off(share link status)": string;
  "Unauthorized(API error)": string;
  "Unknown file route(API error)": string;
  "Up to {size}.(dropzone hint)": string;
  "Upload complete(toast)": string;
  "Upload complete(upload status)": string;
  "Upload failed(API error)": string;
  "Upload failed(toast)": string;
  "Upload failed(upload status)": string;
  "Upload file(button)": string;
  "Upload files(button)": string;
  "Upload finished with errors(toast)": string;
  "Upload part is out of range(API error)": string;
  "Upload paused(toast)": string;
  "Upload progress(upload progress)": string;
  "Upload session has expired(API error)": string;
  "Upload session is invalid(API error)": string;
  "Upload to this folder(object list menu)": string;
  "Uploaded part {partNumber} was not found(API error)": string;
  "Uploaded size does not match the file(API error)": string;
  "Uploading {done}/{total}(toast)": string;
  "Uploading(toast)": string;
  "Uploading…(upload status)": string;
  "Uploads are disabled(API error)": string;
  "Videos(file type group)": string;
  "View(object list)": string;
  "Who the link is for(share link field)": string;
  "Wrong password(API error)": string;
  "You can upload {count} files.(dropzone hint)": string;
  "{count} days(share link expiry)": string;
  "{count} downloads left(shared view)": string;
  "{count} downloads(share link facts)": string;
  "{count} files uploaded(toast)": string;
  "{count} files were rejected(toast)": string;
  "{count} files(object list usage)": string;
  "{count} hours(share link expiry)": string;
  "{count} minutes(share link expiry)": string;
  "{count} of {max} downloads(share link facts)": string;
  "{count} of {max} files(object list usage)": string;
  "{count} results(object list search)": string;
  "{count} selected on this page(object list selection)": string;
  "{count} selected(object list selection)": string;
  "{count} views(share link facts)": string;
  "{count}+ results(object list search)": string;
  "{done} of {total} files uploaded(upload progress)": string;
  "{failed} of {total} failed(API error)": string;
  "{hours}h left(time remaining)": string;
  "{hours}h {minutes}m left(time remaining)": string;
  "{loaded} of {total}(transfer progress)": string;
  "{minutes}m left(time remaining)": string;
  "{percent}%(progress)": string;
  "{seconds}s left(time remaining)": string;
  "{size}/s(transfer speed)": string;
  "{succeeded} succeeded, {failed} failed(toast)": string;
  "{used} of {max}(object list usage)": string;
};
```

## `types/delete.d.ts`

```ts
import type { APIError, S3Api, S3RouteName } from "@dimah-s3/core";
import type { KeyError, OperationOutcome } from "./operation.js";
export type DeleteOperation = {
  id: string;
  key: string;
  batchId: string | null;
  fileName: string | null;
  phase: "deleting" | "success" | "error";
  error: APIError | null;
};
export type DeleteData = {
  key: string;
  bucket?: string;
};
export type DeleteOutcome = Exclude<
  OperationOutcome<DeleteData>,
  {
    status: "aborted";
  }
>;
export type DeleteResult = {
  deleted: string[];
  failed: KeyError[];
  blocked: string[];
};
export type DeleteOptions = {
  fileName?: string;
};
export type DeleteItem =
  | string
  | {
      key: string;
      fileName?: string;
    };
export type UseDeleteOptions = {
  api?: S3Api;
  route: S3RouteName;
  beforeDelete?: (keys: readonly string[]) => boolean | Promise<boolean>;
  onDeleteStart?: (keys: readonly string[]) => void;
  onSuccess?: (data: DeleteData, key: string) => void | Promise<void>;
  onError?: (error: APIError, key: string) => void | Promise<void>;
  onSettled?: (result: DeleteResult) => void | Promise<void>;
};
export type UseDeleteReturn = {
  instanceId: string;
  operations: readonly DeleteOperation[];
  get: (key: string) => DeleteOperation | undefined;
  pendingKeys: readonly string[];
  isPending: boolean;
  remove: (key: string, options?: DeleteOptions) => Promise<DeleteOutcome>;
  removeMany: (items: readonly DeleteItem[]) => Promise<DeleteResult>;
  reset: (key?: string) => void;
};
```

## `types/download.d.ts`

```ts
import type {
  APIError,
  ContentDispositionType,
  DownloadPresignResponse,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
import type { OperationOutcome, TransferProgress } from "./operation.js";
export type DownloadOptions = {
  fileName?: string;
};
export type FetchDownloadOptions = DownloadOptions & {
  fileSize?: number | null;
};
export type PresignOptions = {
  fileName?: string;
  expiresIn?: number;
};
export type DownloadOperation = {
  id: string;
  key: string;
  fileName: string | null;
  phase: "presigning" | "success" | "error" | "aborted";
  error: APIError | null;
  result: DownloadPresignResponse | null;
};
export type DownloadOutcome = OperationOutcome<DownloadPresignResponse>;
type DownloadBase = {
  api?: S3Api;
  route: S3RouteName;
  beforeDownload?: (key: string) => boolean | Promise<boolean>;
  onError?: (error: APIError, key: string) => void | Promise<void>;
};
export type UseDownloadOptions = DownloadBase & {
  disposition?: ContentDispositionType;
  onSuccess?: (
    data: DownloadPresignResponse,
    key: string,
  ) => void | Promise<void>;
  onSettled?: (outcome: DownloadOutcome) => void | Promise<void>;
};
export type UseDownloadReturn = {
  kind: "navigate";
  instanceId: string;
  operations: readonly DownloadOperation[];
  get: (key: string) => DownloadOperation | undefined;
  pendingKeys: readonly string[];
  isPending: boolean;
  download: (
    key: string,
    options?: DownloadOptions,
  ) => Promise<DownloadOutcome>;
  presign: (key: string, options?: PresignOptions) => Promise<DownloadOutcome>;
  cancel: (key?: string) => void;
  reset: (key?: string) => void;
};
export type FetchDownloadResult = {
  fileName: string;
  fileSize: number;
};
export type FetchDownloadOperation = {
  id: string;
  key: string;
  fileName: string | null;
  fileSize: number | null;
  phase: "presigning" | "downloading" | "success" | "error" | "aborted";
  error: APIError | null;
  progress: TransferProgress;
};
export type FetchDownloadOutcome = OperationOutcome<FetchDownloadResult>;
export type UseFetchDownloadOptions = DownloadBase & {
  onDownloadStart?: (key: string) => void;
  onProgress?: (progress: TransferProgress, key: string) => void;
  onSuccess?: (data: FetchDownloadResult, key: string) => void | Promise<void>;
  onSettled?: (outcome: FetchDownloadOutcome) => void | Promise<void>;
};
export type UseFetchDownloadReturn = {
  kind: "fetch";
  instanceId: string;
  operations: readonly FetchDownloadOperation[];
  get: (key: string) => FetchDownloadOperation | undefined;
  pendingKeys: readonly string[];
  isPending: boolean;
  download: (
    key: string,
    options?: FetchDownloadOptions,
  ) => Promise<FetchDownloadOutcome>;
  cancel: (key?: string) => void;
  reset: (key?: string) => void;
};
export type AnyDownloadReturn = UseDownloadReturn | UseFetchDownloadReturn;
```

## `types/index.d.ts`

```ts
export type * from "./operation.js";
export type * from "./upload.js";
export type * from "./upload-store.js";
export type * from "./download.js";
export type * from "./delete.js";
```

## `types/operation.d.ts`

```ts
import type { APIError } from "@dimah-s3/core";
export type OperationOutcome<TData> =
  | {
      status: "success";
      key: string;
      data: TData;
    }
  | {
      status: "error";
      key: string;
      error: APIError;
    }
  | {
      status: "blocked";
      key: string;
    }
  | {
      status: "aborted";
      key: string;
    };
export type KeyError = {
  key: string;
  error: APIError;
};
export type TransferProgress = {
  loaded: number;
  total: number;
  percent: number;
  speed?: number;
};
```

## `types/upload-store.d.ts`

```ts
export type StoredUpload = {
  resumeKey: string;
  ticket: string;
  key: string;
  uploadId: string;
  fileSize: number;
  partSize: number;
  partCount: number;
  checksum: boolean;
};
export type UploadStore = {
  get(
    resumeKey: string,
    fileSize: number,
  ): StoredUpload | null | Promise<StoredUpload | null>;
  set(upload: StoredUpload): void | Promise<void>;
  delete(resumeKey: string): void | Promise<void>;
};
```

## `types/upload.d.ts`

```ts
import type {
  APIError,
  ConfirmedObjectResponse,
  S3Api,
  S3RouteName,
  UploadPresignResponse,
} from "@dimah-s3/core";
import type { TransferProgress } from "./operation.js";
import type { UploadStore } from "./upload-store.js";
export type UploadResult = ConfirmedObjectResponse;
export type UploadRequestOptions = {
  clientMetadata?: Record<string, string>;
  contentType?: string;
  fileName?: string;
};
export type UploadRequestInput =
  | UploadRequestOptions
  | ((file: File) => UploadRequestOptions | Promise<UploadRequestOptions>);
export type UploadCallOptions = {
  uploadOptions?: UploadRequestInput;
  maxFiles?: number;
  append?: boolean;
};
export type UploadFilePhase =
  | "queued"
  | "preparing"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "paused"
  | "success"
  | "error";
export type UploadEnginePhase = Extract<
  UploadFilePhase,
  "preparing" | "presigning" | "uploading" | "finalizing"
>;
export type UploadPhase = "idle" | "uploading" | "paused" | "success" | "error";
export type UploadFileInfo = {
  fileName: string;
  fileSize: number;
  contentType: string;
  previewUrl: string | null;
};
export type UploadFileState = UploadFileInfo & {
  id: string;
  file: File;
  phase: UploadFilePhase;
  progress: TransferProgress;
  error: APIError | null;
  result: UploadResult | null;
};
export type UploadBatchResult = {
  uploaded: {
    file: File;
    result: UploadResult;
  }[];
  failed: {
    file: File;
    error: APIError;
  }[];
  rejected: FileRejection[];
  blocked: File[];
  aborted: File[];
};
export type FileRejection = {
  file: File;
  errors: readonly APIError[];
};
export type UploadLimit = {
  available: number;
  counted?: ReadonlySet<string>;
};
export type RetryConfig = {
  maxRetries?: number;
  baseDelayMs?: number;
};
export type UseUploadOptions = {
  api?: S3Api;
  route: S3RouteName;
  accept?: readonly string[];
  maxFileSize?: number;
  maxFiles?: number;
  multipart?: boolean;
  concurrentFiles?: number;
  concurrentParts?: number;
  retry?: RetryConfig;
  uploadStore?: UploadStore;
  uploadOptions?: UploadRequestInput;
  append?: boolean;
  disabled?: boolean;
  noDrag?: boolean;
  noClick?: boolean;
  noKeyboard?: boolean;
  beforeUpload?: (files: readonly File[]) => boolean | Promise<boolean>;
  onUploadStart?: (files: readonly File[]) => void;
  onProgress?: (progress: TransferProgress, file: File) => void;
  onPartUpload?: (
    part: {
      partNumber: number;
      partCount: number;
    },
    file: File,
  ) => void;
  onMultipartInit?: (
    session: {
      uploadId: string;
      key: string;
    },
    file: File,
  ) => void;
  onSuccess?: (result: UploadResult, file: File) => void | Promise<void>;
  onError?: (error: APIError, file: File) => void | Promise<void>;
  onSettled?: (result: UploadBatchResult) => void | Promise<void>;
  onFileReject?: (rejections: readonly FileRejection[]) => void;
};
export type UploadTransport = (
  file: File,
  presign: UploadPresignResponse,
  options: {
    onProgress?: (progress: TransferProgress) => void;
    signal?: AbortSignal;
  },
) => Promise<void>;
export type S3ApiUploadTransport = {
  uploadTransport?: UploadTransport;
};
export type UploadFileOptions = {
  route: S3RouteName;
  policy: {
    multipart: boolean;
    checksum: boolean;
  };
  concurrentParts?: number;
  retry?: RetryConfig;
  uploadStore?: UploadStore;
  request?: UploadRequestOptions;
  signal?: AbortSignal;
  onProgress?: (progress: TransferProgress) => void;
  onPhaseChange?: (phase: UploadEnginePhase) => void;
  onPartUpload?: (part: { partNumber: number; partCount: number }) => void;
  onMultipartInit?: (session: { uploadId: string; key: string }) => void;
};
export type UploadAbortKind = "cancel" | "detach";
```

## `upload/abort.d.ts`

```ts
import type { UploadAbortKind } from "../types/upload.js";
export declare function uploadAbortReason(kind: UploadAbortKind): DOMException;
export declare function getUploadAbortKind(
  reason: unknown,
): UploadAbortKind | null;
```

## `upload/constants.d.ts`

```ts
export declare const DEFAULT_MULTIPART_THRESHOLD: number;
export declare const MAX_RETRIES = 3;
export declare const RETRY_BASE_DELAY_MS = 1000;
export declare const DEFAULT_CONCURRENT_PARTS = 4;
export declare const DEFAULT_CONCURRENT_FILES = 2;
export declare const DEFAULT_MAX_FILES = 1;
export declare const URL_EXPIRY_MARGIN_MS = 30000;
```

## `upload/index.d.ts`

```ts
export { uploadFile } from "./upload-file.js";
export { getUploadAbortKind, uploadAbortReason } from "./abort.js";
export { multipartResumeKey } from "./resume-key.js";
export { mergeUploadRequest } from "./request.js";
export { DEFAULT_MULTIPART_THRESHOLD } from "./constants.js";
```

## `upload/request.d.ts`

```ts
import type {
  UploadRequestInput,
  UploadRequestOptions,
} from "../types/upload.js";
export declare function mergeUploadRequest(
  base: UploadRequestOptions | undefined,
  override: UploadRequestOptions | undefined,
): UploadRequestOptions;
export declare function resolveUploadRequest(
  input: UploadRequestInput | undefined,
  file: File,
): UploadRequestOptions | Promise<UploadRequestOptions> | undefined;
```

## `upload/resume-key.d.ts`

```ts
import type { UploadRequestOptions } from "../types/upload.js";
export declare function multipartResumeKey(
  route: string,
  file: File,
  request?: UploadRequestOptions,
): string;
```

## `upload/upload-file.d.ts`

```ts
import { type S3Api } from "@dimah-s3/core";
import type { UploadFileOptions, UploadResult } from "../types/upload.js";
export declare function uploadFile(
  api: S3Api,
  file: File,
  options: UploadFileOptions,
): Promise<UploadResult>;
```
