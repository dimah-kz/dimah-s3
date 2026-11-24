# @dimah-s3/ui public API

Generated from the built declarations by `pnpm api:report`. Do not edit it by hand. CI fails when a build differs from it, so review its diff as a change to the public API.

- `@dimah-s3/ui`: `index.d.ts`
- `@dimah-s3/ui/share`: `share.d.ts`

## `components/dimah-s3/attachment/attachment-parts.d.ts`

```ts
import type { ComponentProps } from "react";
import type { useRender } from "@base-ui/react/use-render";
export type AttachmentGroupProps = ComponentProps<"div">;
export declare function AttachmentGroup(
  props: AttachmentGroupProps,
): import("react").JSX.Element;
export type AttachmentActionProps = ComponentProps<"button"> & {
  focusableWhenDisabled?: boolean;
};
export declare function AttachmentAction(
  props: AttachmentActionProps,
): import("react").JSX.Element;
export type AttachmentTriggerProps = useRender.ComponentProps<"button">;
export declare function AttachmentTrigger(
  props: AttachmentTriggerProps,
): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/circle-progress.d.ts`

```ts
export type CircleProgressProps = {
  percent: number;
  strokeWidth?: number;
  className?: string;
} & (
  | {
      fileName: string;
      label?: string;
    }
  | {
      fileName?: string;
      label: string;
    }
);
export declare function CircleProgress({
  percent,
  fileName,
  label,
  strokeWidth,
  className,
}: CircleProgressProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/dismiss-attachment-action.d.ts`

```ts
export type DismissAttachmentActionProps = {
  onDismiss: () => void;
  label?: string;
  className?: string;
};
export declare function DismissAttachmentAction({
  onDismiss,
  label,
  className,
}: DismissAttachmentActionProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/file-attachment.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import type { APIError } from "@dimah-s3/core";
import { type AttachmentState } from "../../../lib/attachment-layout.js";
export type FileAttachmentProps = Omit<ComponentProps<"div">, "children"> & {
  state: AttachmentState;
  fileName: string;
  fileSize?: number | null;
  contentType?: string | null;
  previewUrl?: string | null;
  percent?: number;
  description?: ReactNode;
  error?: string | APIError | null;
  onCancel?: () => void;
  onRetry?: () => void;
  retryDisabled?: boolean;
  onDismiss?: () => void;
  actions?: ReactNode;
  trigger?: ReactNode;
};
export declare function FileAttachment({
  state,
  fileName,
  fileSize,
  contentType,
  previewUrl,
  percent,
  description,
  error,
  onCancel,
  onRetry,
  retryDisabled,
  onDismiss,
  actions,
  trigger,
  className,
  ...props
}: FileAttachmentProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/file-name.d.ts`

```ts
import type { ComponentProps } from "react";
export declare function splitFileName(name: string): {
  stem: string;
  extension: string;
};
export type FileNameProps = Omit<ComponentProps<"span">, "children"> & {
  name: string;
  extension?: boolean;
  highlight?: string;
};
export declare function FileName({
  name,
  extension: keepExtension,
  highlight,
  className,
  ...props
}: FileNameProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/file-type-glyph.d.ts`

```ts
export type FileTypeGlyphStyle = {
  label: string | null;
  styles: Readonly<Record<string, unknown>>;
};
export declare function resolveFileTypeGlyph(
  fileName: string,
  contentType?: string | null,
): FileTypeGlyphStyle;
export type FileTypeGlyphProps = {
  fileName: string;
  contentType?: string | null;
  layout?: "fill" | "icon";
  className?: string;
};
export declare function FileTypeGlyph({
  fileName,
  contentType,
  layout,
  className,
}: FileTypeGlyphProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/folder-glyph.d.ts`

```ts
export type FolderGlyphProps = {
  className?: string;
};
export declare function FolderGlyph({
  className,
}: FolderGlyphProps): import("react").JSX.Element;
```

## `components/dimah-s3/attachment/status-attachment.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import { type AttachmentState } from "../../../lib/attachment-layout.js";
export type StatusAttachmentProps = Omit<
  ComponentProps<"div">,
  "children" | "title"
> & {
  state: AttachmentState;
  title?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
};
export declare function StatusAttachment({
  state,
  title,
  description,
  media,
  actions,
  onDismiss,
  className,
  ...props
}: StatusAttachmentProps): import("react").JSX.Element;
```

## `components/dimah-s3/delete/delete-confirm-dialog.d.ts`

```ts
import { type ReactNode } from "react";
export type DeleteConfirmDialogProps = {
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
};
export declare function DeleteConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
}: DeleteConfirmDialogProps): import("react").JSX.Element;
```

## `components/dimah-s3/delete/delete-toasts.d.ts`

```ts
import { type ReactNode } from "react";
import { type UseDeleteReturn } from "@dimah-s3/react";
export type DeleteToastsProps = {
  delete: UseDeleteReturn;
};
export type DeleteToastMessage = {
  type: "success" | "error";
  title: string;
  description?: ReactNode;
};
export declare function DeleteToasts({ delete: del }: DeleteToastsProps): null;
export declare function useDeleteToasts(
  del: UseDeleteReturn,
  options?: {
    weak?: boolean;
    report?: (message: DeleteToastMessage) => void;
  },
): void;
```

## `components/dimah-s3/delete/delete-trigger.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../../ui/button.js";
import { type DeleteTarget } from "./delete.js";
export type DeleteTriggerProps = ComponentProps<typeof Button> &
  DeleteTarget & {
    note?: ReactNode;
    tooltip?: ReactNode;
  };
export declare function DeleteTrigger({
  objectKey,
  fileName,
  fileSize,
  note,
  tooltip,
  variant,
  size,
  disabled,
  focusableWhenDisabled,
  onClick,
  children,
  ...props
}: DeleteTriggerProps): import("react").JSX.Element;
```

## `components/dimah-s3/delete/delete.d.ts`

```ts
import { type ReactNode } from "react";
import type { DeleteResult, UseDeleteReturn } from "@dimah-s3/react";
export type DeleteTarget = {
  objectKey: string;
  fileName?: string;
  fileSize?: number | null;
};
export type DeleteTargetsFn = (
  targets: readonly DeleteTarget[],
) => Promise<DeleteResult>;
export type DeleteRequestOptions = {
  title?: ReactNode;
  description?: ReactNode;
  note?: ReactNode;
  run?: (remove: DeleteTargetsFn) => Promise<DeleteResult>;
  trigger?: HTMLElement | null;
  onDeleted?: (result: DeleteResult) => void;
  onDismissed?: () => void;
};
export type DeleteProps = {
  delete: UseDeleteReturn;
  confirm?: boolean;
  dialog?: ReactNode;
  onDeleted?: (result: DeleteResult) => void;
  restoreFocus?: (targets: readonly DeleteTarget[]) => HTMLElement | null;
  children: ReactNode;
};
export type DeleteContextValue = {
  delete: UseDeleteReturn;
  confirmation: DeleteConfirmation | null;
  isDeleting: boolean;
  request: (
    targets: DeleteTarget | readonly DeleteTarget[],
    options?: DeleteRequestOptions,
  ) => void;
  confirm: () => Promise<DeleteResult>;
  dismiss: () => void;
};
export type DeleteConfirmation = {
  targets: readonly DeleteTarget[];
  title?: ReactNode;
  description?: ReactNode;
  note?: ReactNode;
};
export declare function Delete({
  delete: del,
  confirm: confirmFirst,
  dialog,
  onDeleted,
  restoreFocus,
  children,
}: DeleteProps): import("react").JSX.Element;
export declare function useDeleteContext(): DeleteContextValue;
export declare function useOptionalDeleteContext(): DeleteContextValue | null;
```

## `components/dimah-s3/download/download-progress.d.ts`

```ts
import type { ComponentProps } from "react";
export type DownloadProgressProps = {
  objectKey: string;
} & Omit<ComponentProps<"div">, "children">;
export declare function DownloadProgress({
  objectKey,
  className,
  "aria-label": ariaLabel,
  ...props
}: DownloadProgressProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/download/download-toasts.d.ts`

```ts
import { type AnyDownloadReturn } from "@dimah-s3/react";
export type DownloadToastsProps = {
  download: AnyDownloadReturn;
};
export declare function DownloadToasts({
  download,
}: DownloadToastsProps): import("react").JSX.Element | null;
export declare function BuiltInDownloadToasts({
  download,
}: DownloadToastsProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/download/download-trigger.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../../ui/button.js";
export type DownloadTriggerProps = ComponentProps<typeof Button> & {
  objectKey: string;
  fileName?: string;
  fileSize?: number | null;
  tooltip?: ReactNode;
};
export declare function DownloadTrigger({
  objectKey,
  fileName,
  fileSize,
  tooltip,
  children,
  className,
  disabled,
  focusableWhenDisabled,
  onClick,
  variant,
  size,
  "aria-label": ariaLabel,
  ...props
}: DownloadTriggerProps): import("react").JSX.Element;
```

## `components/dimah-s3/download/download.d.ts`

```ts
import { type ReactNode } from "react";
import {
  type AnyDownloadReturn,
  type DownloadOperation,
  type FetchDownloadOperation,
  type TransferProgress,
} from "@dimah-s3/react";
export type DownloadProps = {
  download: AnyDownloadReturn;
  children: ReactNode;
};
export type DownloadContextValue = {
  download: AnyDownloadReturn;
};
export declare function Download({
  download,
  children,
}: DownloadProps): import("react").JSX.Element;
export declare function useDownloadContext(): DownloadContextValue;
export declare function isDownloadRunning(
  operation: DownloadOperation | FetchDownloadOperation,
): boolean;
export declare function downloadDisplayName(
  operation: DownloadOperation | FetchDownloadOperation,
): string;
export declare function useFormatDownloadedBytes(): (
  progress: TransferProgress,
) => string | null;
```

## `components/dimah-s3/list/object-list-breadcrumb.d.ts`

```ts
export type ObjectListBreadcrumbProps = {
  className?: string;
};
export declare function ObjectListBreadcrumb({
  className,
}: ObjectListBreadcrumbProps): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-commands.d.ts`

```ts
export type ObjectListCommands = {
  startNewFolder: () => void;
  openMenu: (entryKey: string) => void;
};
type CommandHost = {
  startNewFolder: () => void;
  openMenu: (entryKey: string) => void;
};
export declare function useObjectListCommands(): ObjectListCommands;
export declare function bindObjectListCommands(
  commands: ObjectListCommands,
  host: CommandHost | null,
): void;
```

## `components/dimah-s3/list/object-list-content.d.ts`

```ts
export type ObjectListContentProps = {
  className?: string;
};
export declare function ObjectListContent({
  className,
}: ObjectListContentProps): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-context.d.ts`

```ts
import { type DragEvent, type ReactNode } from "react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import type {
  AnyDownloadReturn,
  DropTargetProps,
  ObjectListEntry,
  ObjectListFolder,
  UseDeleteReturn,
  UseDownloadReturn,
  UseObjectListReturn,
  UseObjectListSelectionReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
export type ObjectListView = "list" | "grid";
export type ObjectListPaginationMode = "auto" | "button";
export type ObjectListRenderers<TItem> = {
  renderEntry?: (entry: ObjectListEntry<TItem>) => ReactNode;
  renderActions?: (entry: ObjectListEntry<TItem>) => ReactNode;
  renderDescription?: (entry: ObjectListEntry<TItem>) => ReactNode;
  renderMeta?: (entry: ObjectListEntry<TItem>) => ReactNode;
};
export type ObjectListThumbnails = {
  route: S3RouteName;
  api?: S3Api;
};
export type ObjectListFeedback = {
  type: "success" | "error" | "info";
  title: string;
  description?: ReactNode;
};
export type ObjectListContextValue<TItem> = {
  list: UseObjectListReturn<TItem>;
  selection: UseObjectListSelectionReturn<TItem> | null;
  upload: UseUploadReturn | null;
  download: AnyDownloadReturn | null;
  share: UseDownloadReturn | null;
  delete: UseDeleteReturn | null;
  toasts: boolean;
  announce: (feedback: ObjectListFeedback) => void;
  view: ObjectListView;
  setView: (view: ObjectListView) => void;
  rootLabel: string;
  startNewFolder: () => void;
  startRename: (key: string) => void;
  revealEntry: (entry: ObjectListEntry<TItem>) => void;
  startMove: (
    entries: readonly ObjectListEntry<TItem>[],
    options?: {
      trigger?: HTMLElement | null;
    },
  ) => void;
};
export type ObjectListInternalValue<TItem> = Pick<
  ObjectListRenderers<TItem>,
  "renderEntry"
> & {
  sizing: "fixed" | "max" | null;
  showBreadcrumb: boolean;
  selectionActions: ReactNode;
  empty: ReactNode;
  pagination: ObjectListPaginationMode;
  prepareDeleteFocus: (entryKeys: readonly string[]) => void;
  newFolderOpen: boolean;
  closeNewFolder: () => void;
  endRename: (key: string, focus?: boolean) => void;
};
export type ObjectListEntryScope<TItem> = Omit<
  ObjectListRenderers<TItem>,
  "renderEntry"
> & {
  store: ObjectListEntryStore;
  selectable: ReadonlySet<string>;
  opensFiles: boolean;
  folderUploads: boolean;
  download: boolean;
  share: boolean;
  delete: boolean;
  deleteFolder: boolean;
  renameFile: boolean;
  renameFolder: boolean;
  moveFile: boolean;
  moveFolder: boolean;
  thumbnails: ObjectListThumbnails | null;
  search: string;
  open: (entry: ObjectListEntry<TItem>) => void;
  toggle: (
    key: string,
    options?: {
      range?: boolean;
      value?: boolean;
    },
  ) => void;
  folderDropTarget: (id: string) => DropTargetProps;
  moveSource: (
    entry: ObjectListEntry<TItem>,
  ) => ObjectListMoveSourceProps | null;
  moveTarget: (folder: ObjectListFolder | null) => DropTargetProps;
  startRename: (key: string) => void;
  endRename: (key: string, focus?: boolean) => void;
  revealEntry: (entry: ObjectListEntry<TItem>) => void;
  startMove: ObjectListContextValue<TItem>["startMove"];
};
export type ObjectListMoveSourceProps = {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
};
export type ObjectListEntryState = {
  selected: ReadonlySet<string>;
  selecting: boolean;
  renaming: string | null;
  menu: string | null;
  tabStop: string | null;
};
export type ObjectListEntryStore = {
  get: () => ObjectListEntryState;
  set: (next: Partial<ObjectListEntryState>) => void;
  subscribe: (listener: () => void) => () => void;
};
export declare function createObjectListEntryStore(
  initial: ObjectListEntryState,
): ObjectListEntryStore;
export type ObjectListHeaderContextValue = {
  setSearchExpanded: (expanded: boolean) => void;
  setFolderExpanded: (expanded: boolean) => void;
};
export declare const ObjectListHeaderContext: import("react").Context<ObjectListHeaderContextValue | null>;
export declare function useOptionalObjectListHeader(): ObjectListHeaderContextValue | null;
export declare function ObjectListProvider<TItem>({
  value,
  internal,
  scope,
  children,
}: {
  value: ObjectListContextValue<TItem>;
  internal?: ObjectListInternalValue<TItem>;
  scope?: ObjectListEntryScope<TItem>;
  children: ReactNode;
}): import("react").JSX.Element;
export declare function ObjectListEntryProvider<TItem>({
  entry,
  children,
}: {
  entry: ObjectListEntry<TItem>;
  children: ReactNode;
}): import("react").JSX.Element;
export declare function useObjectListContext<
  TItem = unknown,
>(): ObjectListContextValue<TItem>;
export declare function useOptionalObjectListContext<
  TItem = unknown,
>(): ObjectListContextValue<TItem> | null;
export declare function useObjectListInternal<
  TItem = unknown,
>(): ObjectListInternalValue<TItem>;
export declare function useObjectListEntry<
  TItem = unknown,
>(): ObjectListEntry<TItem> | null;
export declare function useOptionalObjectListEntryScope<
  TItem = unknown,
>(): ObjectListEntryScope<TItem> | null;
export declare function useObjectListEntryScope<
  TItem = unknown,
>(): ObjectListEntryScope<TItem>;
export type ObjectListEntryStatus = {
  selectable: boolean;
  selected: boolean;
  selecting: boolean;
  renaming: boolean;
  tabStop: boolean;
};
export declare function useObjectListEntryStatus(
  key: string,
): ObjectListEntryStatus;
```

## `components/dimah-s3/list/object-list-controls.d.ts`

```ts
import type { ObjectListSortDirection } from "@dimah-s3/react";
export type ObjectListSortOption = {
  field: string;
  label: string;
  direction?: ObjectListSortDirection;
};
export type ObjectListSortMenuProps = {
  options?: readonly ObjectListSortOption[];
  className?: string;
};
export declare function ObjectListSortMenu({
  options,
  className,
}: ObjectListSortMenuProps): import("react").JSX.Element;
export type ObjectListViewToggleProps = {
  className?: string;
};
export declare function ObjectListViewToggle({
  className,
}: ObjectListViewToggleProps): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-entry-menu.d.ts`

```ts
import { type ReactNode } from "react";
import { type UseDownloadReturn } from "@dimah-s3/react";
export type ObjectListEntryMenuAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
};
export type ObjectListEntryMenuProps = {
  objectKey?: string;
  fileName?: string;
  fileSize?: number | null;
  share?: UseDownloadReturn;
  expiresIn?: number;
  actions?: readonly ObjectListEntryMenuAction[];
  children?: ReactNode;
  className?: string;
};
export declare function ObjectListEntryMenu({
  objectKey: objectKeyProp,
  fileName: fileNameProp,
  fileSize: fileSizeProp,
  share: shareProp,
  expiresIn,
  actions,
  children,
  className,
}: ObjectListEntryMenuProps): import("react").JSX.Element | null;
export type ObjectListEntryMenuItemProps = {
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
  children?: ReactNode;
};
export declare function ObjectListEntryMenuItem({
  onClick,
  disabled,
  destructive,
  className,
  children,
}: ObjectListEntryMenuItemProps): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-entry.d.ts`

```ts
import { type ReactNode } from "react";
import { type ObjectListEntry } from "@dimah-s3/react";
export type ObjectListEntryProps<TItem> = {
  entry: ObjectListEntry<TItem>;
  className?: string;
  actions?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  media?: ReactNode;
};
export type ObjectListCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onCheckedChange: (checked: boolean, shiftKey: boolean) => void;
  tabIndex?: number;
  className?: string;
};
export declare function ObjectListCheckbox({
  checked,
  indeterminate,
  label,
  onCheckedChange,
  tabIndex,
  className,
}: ObjectListCheckboxProps): import("react").JSX.Element;
export declare const ObjectListRow: <TItem>(
  props: ObjectListEntryProps<TItem>,
) => ReactNode;
export declare const ObjectListTile: <TItem>(
  props: ObjectListEntryProps<TItem>,
) => ReactNode;
```

## `components/dimah-s3/list/object-list-header.d.ts`

```ts
import { type ReactNode } from "react";
import {
  type UseObjectListReturn,
  type UseObjectListSelectionReturn,
} from "@dimah-s3/react";
export type ObjectListHeaderProps = {
  children?: ReactNode;
  breadcrumb?: boolean;
  searchBar?: boolean;
  selectionActions?: ReactNode;
  className?: string;
};
export declare const OBJECT_LIST_HEADER_COMPACT_LABEL =
  "@max-[36rem]/object-list-header:sr-only";
export declare const OBJECT_LIST_HEADER_COMPACT_BUTTON =
  "pointer-coarse:h-8 @max-[36rem]/object-list-header:aspect-square @max-[36rem]/object-list-header:px-0!";
export declare function ObjectListHeader({
  children,
  breadcrumb,
  searchBar,
  selectionActions,
  className,
}: ObjectListHeaderProps): import("react").JSX.Element;
export type ObjectListSelectAllProps = {
  className?: string;
};
export declare function ObjectListSelectAll({
  className,
}: ObjectListSelectAllProps): import("react").JSX.Element | null;
export type ObjectListSelectionBarProps = {
  actions?: ReactNode;
  className?: string;
};
export declare function ObjectListSelectionBar({
  actions,
  className,
}: ObjectListSelectionBarProps): import("react").JSX.Element | null;
export declare function useSelectionCount<TItem>(
  list: UseObjectListReturn<TItem>,
  selection: UseObjectListSelectionReturn<TItem> | null,
): string | null;
export type ObjectListBulkDeleteProps = {
  className?: string;
};
export declare function ObjectListBulkDelete({
  className,
}: ObjectListBulkDeleteProps): import("react").JSX.Element | null;
export type ObjectListBulkMoveProps = {
  className?: string;
};
export declare function ObjectListBulkMove({
  className,
}: ObjectListBulkMoveProps): import("react").JSX.Element | null;
export type ObjectListNewFolderProps = {
  className?: string;
};
export declare function ObjectListNewFolder({
  className,
}: ObjectListNewFolderProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/list/object-list-search.d.ts`

```ts
import {
  type ObjectListFolder,
  type UseObjectListReturn,
} from "@dimah-s3/react";
export declare function canChooseSearchScope<TItem>(
  list: UseObjectListReturn<TItem>,
): boolean;
export type ObjectListSearchProps = {
  placeholder?: string;
  debounceMs?: number;
  collapsible?: boolean;
  className?: string;
};
export declare function ObjectListSearch({
  placeholder,
  debounceMs,
  collapsible,
  className,
}: ObjectListSearchProps): import("react").JSX.Element;
export declare function useObjectListSearchStatus<TItem>(
  list: UseObjectListReturn<TItem>,
): {
  label: string;
  settled: boolean;
} | null;
export type ObjectListSearchBarProps = {
  className?: string;
};
export declare function ObjectListSearchBar({
  className,
}: ObjectListSearchBarProps): import("react").JSX.Element | null;
export type ObjectListLocationProps = {
  location: readonly ObjectListFolder[];
  className?: string;
};
export declare function ObjectListLocation({
  location,
  className,
}: ObjectListLocationProps): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-states.d.ts`

```ts
import { type ReactNode } from "react";
import {
  type ObjectListPaginationMode,
  type ObjectListView,
} from "./object-list-context.js";
export type ObjectListEmptyProps = {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
};
export declare function ObjectListEmpty({
  title,
  description,
  children,
  className,
}: ObjectListEmptyProps): import("react").JSX.Element;
export declare function ObjectListError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void | Promise<void>;
}): import("react").JSX.Element;
export declare function ObjectListErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void | Promise<void>;
}): import("react").JSX.Element;
export declare function ObjectListSkeleton({
  view,
}: {
  view: ObjectListView;
}): import("react").JSX.Element;
export declare function ObjectListNextPage({
  mode,
  root,
  ready,
}: {
  mode: ObjectListPaginationMode;
  root: HTMLElement | null;
  ready: boolean;
}): import("react").JSX.Element | null;
```

## `components/dimah-s3/list/object-list-upload.d.ts`

```ts
import type { UseUploadReturn } from "@dimah-s3/react";
export declare function useRefreshListAfterUpload(
  upload: UseUploadReturn | undefined,
  refresh: () => void | Promise<void>,
): void;
export type ObjectListUploadStatusProps = {
  className?: string;
};
export declare function ObjectListUploadStatus({
  className,
}: ObjectListUploadStatusProps): import("react").JSX.Element | null;
export declare function ObjectListDropOverlay({
  upload,
  active,
  target,
  folder,
}: {
  upload: UseUploadReturn;
  active: boolean;
  target?: "frame" | "folder" | "dropzone";
  folder?: string | null;
}): import("react").JSX.Element;
```

## `components/dimah-s3/list/object-list-usage.d.ts`

```ts
import { type ReactNode } from "react";
import { type ObjectListUsageData } from "@dimah-s3/react";
export type ObjectListUsageState = {
  usage: ObjectListUsageData;
  bytesLabel: string;
  filesLabel: string;
  byteRatio: number | null;
  fileRatio: number | null;
  meterRatio: number | null;
  over: boolean;
};
export type ObjectListUsageProps = {
  className?: string;
  usage?: ObjectListUsageData | null;
  children?: ReactNode | ((state: ObjectListUsageState) => ReactNode);
};
export type ObjectListUsageMeterProps = {
  className?: string;
};
export declare function ObjectListUsage({
  className,
  usage: usageProp,
  children,
}: ObjectListUsageProps): import("react").JSX.Element | null;
export declare function ObjectListUsageMeter({
  className,
}: ObjectListUsageMeterProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/list/object-list.d.ts`

```ts
import { type ReactNode } from "react";
import type {
  AnyDownloadReturn,
  DeleteResult,
  UseDeleteReturn,
  UseDownloadReturn,
  UseObjectListReturn,
  UseObjectListSelectionReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
import {
  type ObjectListPaginationMode,
  type ObjectListRenderers,
  type ObjectListThumbnails,
  type ObjectListView,
} from "./object-list-context.js";
import { type ObjectListCommands } from "./object-list-commands.js";
export type ObjectListProps<TItem> = ObjectListRenderers<TItem> & {
  list: UseObjectListReturn<TItem>;
  selection?: UseObjectListSelectionReturn<TItem>;
  upload?: UseUploadReturn;
  download?: AnyDownloadReturn;
  share?: UseDownloadReturn;
  delete?: UseDeleteReturn;
  toasts?: boolean;
  view?: ObjectListView;
  defaultView?: ObjectListView;
  onViewChange?: (view: ObjectListView) => void;
  onOpenItem?: (item: TItem) => void;
  thumbnails?: ObjectListThumbnails;
  onDeleted?: (result: DeleteResult) => void;
  rootLabel?: string;
  breadcrumb?: boolean;
  toolbar?: ReactNode;
  selectionActions?: ReactNode;
  commands?: ObjectListCommands;
  empty?: ReactNode;
  pagination?: ObjectListPaginationMode;
  height?: number | string;
  maxHeight?: number | string;
  className?: string;
  children?: ReactNode;
};
export declare function ObjectList<TItem>({
  list,
  selection,
  upload,
  download,
  share,
  delete: del,
  toasts,
  view: viewProp,
  defaultView,
  onViewChange,
  onOpenItem,
  thumbnails,
  onDeleted,
  rootLabel,
  breadcrumb,
  toolbar,
  selectionActions,
  commands,
  empty,
  pagination,
  height,
  maxHeight,
  className,
  children,
  renderEntry,
  renderActions,
  renderDescription,
  renderMeta,
}: ObjectListProps<TItem>): import("react").JSX.Element;
```

## `components/dimah-s3/preview/object-card.d.ts`

```ts
import type {
  AnyDownloadReturn,
  DeleteResult,
  UseDeleteReturn,
} from "@dimah-s3/react";
import { type FileAttachmentProps } from "../attachment/file-attachment.js";
export type ObjectCardProps = Omit<
  FileAttachmentProps,
  | "state"
  | "fileName"
  | "percent"
  | "error"
  | "onCancel"
  | "onRetry"
  | "retryDisabled"
  | "onDismiss"
> & {
  objectKey: string;
  fileName?: string;
  download?: AnyDownloadReturn;
  delete?: UseDeleteReturn;
  onDeleted?: (result: DeleteResult) => void;
};
export declare function ObjectCard({
  objectKey,
  fileName,
  fileSize,
  download,
  delete: del,
  onDeleted,
  description,
  actions,
  ...props
}: ObjectCardProps): import("react").JSX.Element;
```

## `components/dimah-s3/preview/object-image.d.ts`

```ts
import { type ComponentProps, type ReactNode } from "react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
export type ObjectImageProps = Omit<ComponentProps<"img">, "src"> & {
  route: S3RouteName;
  objectKey: string | null;
  alt: string;
  api?: S3Api;
  fallback?: ReactNode;
};
export declare function ObjectImage({
  route,
  objectKey,
  alt,
  api,
  fallback,
  onError,
  onLoad,
  ...props
}: ObjectImageProps):
  | string
  | number
  | bigint
  | boolean
  | import("react").JSX.Element
  | Iterable<ReactNode>
  | Promise<
      | string
      | number
      | bigint
      | boolean
      | Iterable<ReactNode>
      | import("react").ReactElement<
          unknown,
          string | import("react").JSXElementConstructor<any>
        >
      | import("react").ReactPortal
      | null
      | undefined
    >
  | null;
```

## `components/dimah-s3/share/share-link-dialog.d.ts`

```ts
import { type ObjectListEntry } from "@dimah-s3/react";
import type { ShareTargetInput } from "@dimah-s3/share/client";
import type { UseShareLinksReturn } from "@dimah-s3/share/react";
import { type ShareLinkFieldsOptions } from "./share-link-fields.js";
export type ShareLinkDialogProps = {
  links: UseShareLinksReturn;
  name?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expiryOptions?: readonly (number | null)[];
  linkUrl?: (token: string) => string;
  fields?: ShareLinkFieldsOptions;
  className?: string;
};
export declare function shareTargetOf<TItem>(
  entry: ObjectListEntry<TItem>,
  options?: {
    bucket?: string;
  },
): ShareTargetInput;
export declare function ShareLinkDialog({
  links,
  name,
  open,
  onOpenChange,
  expiryOptions,
  linkUrl,
  fields,
  className,
}: ShareLinkDialogProps): import("react").JSX.Element;
```

## `components/dimah-s3/share/share-link-fields.d.ts`

```ts
import {
  type ShareClientLink,
  type ShareLinkSettingsInput,
} from "@dimah-s3/share/client";
export declare const DEFAULT_SHARE_EXPIRY_OPTIONS: readonly (number | null)[];
export type ShareLinkFieldsOptions = {
  password?: boolean;
  maxDownloads?: boolean;
  label?: boolean;
};
export type ShareLinkDraft = {
  expiry: string;
  password: string;
  removePassword: boolean;
  maxDownloads: string;
  label: string;
};
export declare function newLinkDraft(): ShareLinkDraft;
export declare function linkDraft(link: ShareClientLink): ShareLinkDraft;
export declare function draftSettings(
  draft: ShareLinkDraft,
  expiryOptions: readonly (number | null)[],
  link?: ShareClientLink,
): ShareLinkSettingsInput;
export declare function useShareDurationLabel(): (
  seconds: number | null,
) => string;
export declare function ShareLinkFields({
  draft,
  onChange,
  expiryOptions,
  fields,
  link,
  pending,
}: {
  draft: ShareLinkDraft;
  onChange: (draft: ShareLinkDraft) => void;
  expiryOptions: readonly (number | null)[];
  fields?: ShareLinkFieldsOptions;
  link?: ShareClientLink;
  pending?: boolean;
}): import("react").JSX.Element;
```

## `components/dimah-s3/share/shared-view.d.ts`

```ts
import { type ReactNode } from "react";
import type { ShareVisitorOpenLink } from "@dimah-s3/share/client";
import type { UseShareVisitReturn } from "@dimah-s3/share/react";
export type SharedViewProps = {
  visit: UseShareVisitReturn;
  header?: (link: ShareVisitorOpenLink) => ReactNode;
  rootLabel?: string;
  height?: string;
  className?: string;
};
export declare function SharedView({
  visit,
  header,
  rootLabel,
  height,
  className,
}: SharedViewProps): import("react").JSX.Element;
```

## `components/dimah-s3/toast/toaster.d.ts`

```ts
import type { ReactNode } from "react";
export type ToasterProps = {
  limit?: number;
  timeout?: number;
  children?: ReactNode;
};
export declare function Toaster({
  limit,
  timeout,
  children,
}: ToasterProps): import("react").JSX.Element;
export type ToastType = "success" | "error" | "warning" | "info" | "loading";
export type ToastOptions = {
  title?: ReactNode;
  description?: ReactNode;
  type?: ToastType;
  timeout?: number;
  priority?: "low" | "high";
  action?: {
    label: ReactNode;
    onClick: () => void;
  };
  onClose?: () => void;
};
export declare const toast: {
  add(options: ToastOptions): string;
  update(id: string, options: ToastOptions): void;
  close(id?: string): void;
};
```

## `components/dimah-s3/upload/avatar-upload.d.ts`

```ts
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import { type UploadResult, type UseUploadReturn } from "@dimah-s3/react";
export type AvatarUploadProps = {
  upload: UseUploadReturn;
  route: S3RouteName;
  objectKey?: string | null;
  label: string;
  onUploaded?: (result: UploadResult) => void;
  size?: number;
  shape?: "circle" | "square";
  className?: string;
  api?: S3Api;
};
export declare function AvatarUpload({
  upload,
  route,
  objectKey,
  label,
  onUploaded,
  size,
  shape,
  api,
  className,
}: AvatarUploadProps): import("react").JSX.Element;
```

## `components/dimah-s3/upload/upload-dropzone.d.ts`

```ts
import { type HTMLAttributes } from "react";
import type { UploadCallOptions } from "@dimah-s3/react";
export type UploadDropzoneProps = HTMLAttributes<HTMLDivElement> & {
  call?: UploadCallOptions;
};
export declare function UploadDropzone({
  call,
  className,
  children,
  onDragEnter,
  onDragLeave,
  onDrop,
  ...props
}: UploadDropzoneProps): import("react").JSX.Element;
export type UploadDropzoneTriggerProps = HTMLAttributes<HTMLDivElement>;
export declare function UploadDropzoneTrigger({
  className,
  children,
  "aria-describedby": describedBy,
  ...props
}: UploadDropzoneTriggerProps): import("react").JSX.Element;
```

## `components/dimah-s3/upload/upload-field.d.ts`

```ts
import { type ComponentProps, type ReactNode } from "react";
import type { UseUploadReturn } from "@dimah-s3/react";
export type UploadFieldProps = {
  upload: UseUploadReturn;
  name: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (keys: string[]) => void;
  maxFiles?: number;
  children: ReactNode;
};
export type UploadFieldItem = {
  key: string;
  fileName: string;
  fileSize: number | null;
  contentType: string | null;
  file: File | null;
};
export type UploadFieldContextValue = {
  name: string;
  value: readonly string[];
  items: readonly UploadFieldItem[];
  remaining: number | null;
  remove: (key: string) => void;
};
export declare function UploadField({
  upload,
  name,
  value: controlledValue,
  defaultValue,
  onValueChange,
  maxFiles,
  children,
}: UploadFieldProps): import("react").JSX.Element;
export declare function useUploadFieldContext(): UploadFieldContextValue;
export type UploadFieldValueProps = Omit<ComponentProps<"ul">, "children"> & {
  children?: (item: UploadFieldItem) => ReactNode;
};
export declare function UploadFieldValue({
  children,
  className,
  ...props
}: UploadFieldValueProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/upload/upload-file-list.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import type { UploadFileState } from "@dimah-s3/react";
import { type FileAttachmentProps } from "../attachment/file-attachment.js";
export type UploadFileItemProps = Omit<
  FileAttachmentProps,
  | "state"
  | "fileName"
  | "fileSize"
  | "contentType"
  | "previewUrl"
  | "percent"
  | "error"
  | "onCancel"
  | "onRetry"
  | "retryDisabled"
> & {
  file: UploadFileState;
};
export declare function UploadFileItem({
  file,
  description,
  actions,
  ...props
}: UploadFileItemProps): import("react").JSX.Element;
export type UploadFileListLayout = "list" | "grid";
export type UploadFileListProps = Omit<ComponentProps<"ul">, "children"> & {
  layout?: UploadFileListLayout;
  children?: (file: UploadFileState) => ReactNode;
};
export declare function UploadFileList({
  layout,
  children,
  className,
  ...props
}: UploadFileListProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/upload/upload-status.d.ts`

```ts
import type { ComponentProps } from "react";
import { type UploadFileListLayout } from "./upload-file-list.js";
export type UploadStatusProps = Omit<ComponentProps<"div">, "children"> & {
  layout?: UploadFileListLayout;
};
export declare function UploadStatus({
  layout,
  className,
  ...props
}: UploadStatusProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/upload/upload-toasts.d.ts`

```ts
import type { UseUploadReturn } from "@dimah-s3/react";
export type UploadToastsProps = {
  upload: UseUploadReturn;
};
export declare function UploadToasts({
  upload,
}: UploadToastsProps): import("react").JSX.Element | null;
export declare function BuiltInUploadToasts({
  upload,
}: UploadToastsProps): import("react").JSX.Element | null;
```

## `components/dimah-s3/upload/upload-trigger.d.ts`

```ts
import type { ComponentProps, ReactNode } from "react";
import type { UploadCallOptions } from "@dimah-s3/react";
import { Button } from "../../ui/button.js";
export type UploadTriggerProps = ComponentProps<typeof Button> & {
  call?: UploadCallOptions;
  tooltip?: ReactNode;
};
export declare function UploadTrigger({
  call,
  tooltip,
  disabled,
  focusableWhenDisabled,
  className,
  children,
  onClick,
  size,
  ...props
}: UploadTriggerProps): import("react").JSX.Element;
```

## `components/dimah-s3/upload/upload.d.ts`

```ts
import { type ReactNode } from "react";
import type { UploadCallOptions, UseUploadReturn } from "@dimah-s3/react";
export type UploadProps = {
  upload: UseUploadReturn;
  isFull?: boolean;
  hideUploaded?: boolean;
  children: ReactNode;
};
export type UploadContextValue = {
  upload: UseUploadReturn;
  isFull: boolean;
  hideUploaded: boolean;
};
declare const INTAKE_ATTRIBUTE = "data-dimah-s3-upload-intake";
type UploadFocusValue = {
  intakeProps: {
    [INTAKE_ATTRIBUTE]: string;
  };
  keepFocus: () => void;
};
export declare function Upload({
  upload,
  isFull,
  hideUploaded,
  children,
}: UploadProps): import("react").JSX.Element;
export declare function useUploadContext(): UploadContextValue;
export declare function useUploadFocus(): UploadFocusValue;
export declare function useUploadCall(
  upload: UseUploadReturn,
  call: UploadCallOptions | undefined,
): UploadCallOptions | undefined;
```

## `components/ui/button.d.ts`

```ts
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";
declare const buttonVariants: (
  props?:
    | ({
        variant?:
          | "default"
          | "destructive"
          | "ghost"
          | "link"
          | "outline"
          | "secondary"
          | null
          | undefined;
        size?:
          | "default"
          | "icon"
          | "icon-lg"
          | "icon-sm"
          | "icon-xs"
          | "lg"
          | "sm"
          | "xs"
          | null
          | undefined;
      } & import("class-variance-authority/types").ClassProp)
    | undefined,
) => string;
declare function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants>): import("react").JSX.Element;
export { Button, buttonVariants };
```

## `hooks/use-paste-files.d.ts`

```ts
import type { UploadCallOptions, UseUploadReturn } from "@dimah-s3/react";
export type UsePasteFilesOptions = {
  call?: UploadCallOptions;
  enabled?: boolean;
};
export declare function usePasteFiles(
  upload: Pick<UseUploadReturn, "handleFiles" | "disabled">,
  options?: UsePasteFilesOptions,
): void;
```

## `hooks/use-toast-owner.d.ts`

```ts
export type UseToastOwnerOptions = {
  weak?: boolean;
};
export declare function useToastOwner(
  instanceId: string,
  options?: UseToastOwnerOptions,
): boolean;
```

## `index.d.ts`

```ts
export {
  Upload,
  useUploadContext,
  type UploadProps,
  type UploadContextValue,
} from "./components/dimah-s3/upload/upload.js";
export {
  UploadTrigger,
  type UploadTriggerProps,
} from "./components/dimah-s3/upload/upload-trigger.js";
export {
  UploadDropzone,
  UploadDropzoneTrigger,
  type UploadDropzoneProps,
  type UploadDropzoneTriggerProps,
} from "./components/dimah-s3/upload/upload-dropzone.js";
export {
  UploadStatus,
  type UploadStatusProps,
} from "./components/dimah-s3/upload/upload-status.js";
export {
  UploadFileList,
  UploadFileItem,
  type UploadFileListLayout,
  type UploadFileListProps,
  type UploadFileItemProps,
} from "./components/dimah-s3/upload/upload-file-list.js";
export {
  useUploadHints,
  type UploadHints,
  type UploadHintsPolicy,
} from "./lib/upload-hints.js";
export {
  UploadToasts,
  type UploadToastsProps,
} from "./components/dimah-s3/upload/upload-toasts.js";
export {
  usePasteFiles,
  type UsePasteFilesOptions,
} from "./hooks/use-paste-files.js";
export {
  UploadField,
  UploadFieldValue,
  useUploadFieldContext,
  type UploadFieldProps,
  type UploadFieldValueProps,
  type UploadFieldItem,
  type UploadFieldContextValue,
} from "./components/dimah-s3/upload/upload-field.js";
export {
  AvatarUpload,
  type AvatarUploadProps,
} from "./components/dimah-s3/upload/avatar-upload.js";
export {
  ObjectImage,
  type ObjectImageProps,
} from "./components/dimah-s3/preview/object-image.js";
export {
  ObjectCard,
  type ObjectCardProps,
} from "./components/dimah-s3/preview/object-card.js";
export {
  Download,
  useDownloadContext,
  type DownloadProps,
  type DownloadContextValue,
} from "./components/dimah-s3/download/download.js";
export {
  DownloadTrigger,
  type DownloadTriggerProps,
} from "./components/dimah-s3/download/download-trigger.js";
export {
  DownloadProgress,
  type DownloadProgressProps,
} from "./components/dimah-s3/download/download-progress.js";
export {
  DownloadToasts,
  type DownloadToastsProps,
} from "./components/dimah-s3/download/download-toasts.js";
export {
  Delete,
  useDeleteContext,
  type DeleteProps,
  type DeleteConfirmation,
  type DeleteContextValue,
  type DeleteTarget,
  type DeleteTargetsFn,
  type DeleteRequestOptions,
} from "./components/dimah-s3/delete/delete.js";
export {
  DeleteTrigger,
  type DeleteTriggerProps,
} from "./components/dimah-s3/delete/delete-trigger.js";
export {
  DeleteConfirmDialog,
  type DeleteConfirmDialogProps,
} from "./components/dimah-s3/delete/delete-confirm-dialog.js";
export {
  DeleteToasts,
  type DeleteToastsProps,
} from "./components/dimah-s3/delete/delete-toasts.js";
export {
  ObjectList,
  type ObjectListProps,
} from "./components/dimah-s3/list/object-list.js";
export {
  useObjectListCommands,
  type ObjectListCommands,
} from "./components/dimah-s3/list/object-list-commands.js";
export {
  useObjectListContext,
  useObjectListEntry,
  type ObjectListContextValue,
  type ObjectListFeedback,
  type ObjectListPaginationMode,
  type ObjectListRenderers,
  type ObjectListThumbnails,
  type ObjectListView,
} from "./components/dimah-s3/list/object-list-context.js";
export {
  ObjectListHeader,
  ObjectListSelectAll,
  ObjectListSelectionBar,
  ObjectListBulkDelete,
  ObjectListBulkMove,
  ObjectListNewFolder,
  type ObjectListBulkDeleteProps,
  type ObjectListBulkMoveProps,
  type ObjectListHeaderProps,
  type ObjectListSelectAllProps,
  type ObjectListSelectionBarProps,
  type ObjectListNewFolderProps,
} from "./components/dimah-s3/list/object-list-header.js";
export {
  ObjectListBreadcrumb,
  type ObjectListBreadcrumbProps,
} from "./components/dimah-s3/list/object-list-breadcrumb.js";
export {
  ObjectListSortMenu,
  ObjectListViewToggle,
  type ObjectListSortMenuProps,
  type ObjectListSortOption,
  type ObjectListViewToggleProps,
} from "./components/dimah-s3/list/object-list-controls.js";
export {
  ObjectListLocation,
  ObjectListSearch,
  ObjectListSearchBar,
  type ObjectListLocationProps,
  type ObjectListSearchBarProps,
  type ObjectListSearchProps,
} from "./components/dimah-s3/list/object-list-search.js";
export {
  ObjectListContent,
  type ObjectListContentProps,
} from "./components/dimah-s3/list/object-list-content.js";
export {
  ObjectListRow,
  ObjectListTile,
  ObjectListCheckbox,
  type ObjectListCheckboxProps,
  type ObjectListEntryProps,
} from "./components/dimah-s3/list/object-list-entry.js";
export {
  ObjectListEmpty,
  type ObjectListEmptyProps,
} from "./components/dimah-s3/list/object-list-states.js";
export {
  ObjectListUsage,
  ObjectListUsageMeter,
  type ObjectListUsageMeterProps,
  type ObjectListUsageProps,
  type ObjectListUsageState,
} from "./components/dimah-s3/list/object-list-usage.js";
export {
  ObjectListUploadStatus,
  type ObjectListUploadStatusProps,
} from "./components/dimah-s3/list/object-list-upload.js";
export {
  ObjectListEntryMenu,
  ObjectListEntryMenuItem,
  type ObjectListEntryMenuAction,
  type ObjectListEntryMenuItemProps,
  type ObjectListEntryMenuProps,
} from "./components/dimah-s3/list/object-list-entry-menu.js";
export {
  FileAttachment,
  type FileAttachmentProps,
} from "./components/dimah-s3/attachment/file-attachment.js";
export {
  StatusAttachment,
  type StatusAttachmentProps,
} from "./components/dimah-s3/attachment/status-attachment.js";
export {
  CircleProgress,
  type CircleProgressProps,
} from "./components/dimah-s3/attachment/circle-progress.js";
export {
  FileName,
  type FileNameProps,
} from "./components/dimah-s3/attachment/file-name.js";
export {
  FileTypeGlyph,
  type FileTypeGlyphProps,
} from "./components/dimah-s3/attachment/file-type-glyph.js";
export {
  FolderGlyph,
  type FolderGlyphProps,
} from "./components/dimah-s3/attachment/folder-glyph.js";
export {
  DismissAttachmentAction,
  type DismissAttachmentActionProps,
} from "./components/dimah-s3/attachment/dismiss-attachment-action.js";
export {
  AttachmentGroup,
  AttachmentAction,
  AttachmentTrigger,
  type AttachmentGroupProps,
  type AttachmentActionProps,
  type AttachmentTriggerProps,
} from "./components/dimah-s3/attachment/attachment-parts.js";
export type { AttachmentState } from "./lib/attachment-layout.js";
export {
  Toaster,
  toast,
  type ToasterProps,
  type ToastOptions,
  type ToastType,
} from "./components/dimah-s3/toast/toaster.js";
export {
  useToastOwner,
  type UseToastOwnerOptions,
} from "./hooks/use-toast-owner.js";
```

## `lib/attachment-layout.d.ts`

```ts
export type AttachmentState =
  "idle" | "uploading" | "processing" | "error" | "done";
export declare const ATTACHMENT_ERROR_DESCRIPTION_CLASS =
  "overflow-visible whitespace-normal [overflow-wrap:anywhere]";
export declare const ATTACHMENT_TITLE_CLASS =
  "max-w-[48ch] dark:shimmer-color-dimah-s3-muted-foreground";
```

## `lib/upload-hints.d.ts`

```ts
import { type UploadPolicy } from "@dimah-s3/react";
export type UploadHintsPolicy = Pick<
  UploadPolicy,
  "accept" | "maxFileSize" | "maxFiles"
>;
export type UploadHints = {
  limits: string | null;
  accept: string | null;
};
export declare function useUploadHints(policy: UploadHintsPolicy): UploadHints;
```

## `share.d.ts`

```ts
export {
  ShareLinkDialog,
  shareTargetOf,
  type ShareLinkDialogProps,
} from "./components/dimah-s3/share/share-link-dialog.js";
export {
  DEFAULT_SHARE_EXPIRY_OPTIONS,
  type ShareLinkFieldsOptions,
} from "./components/dimah-s3/share/share-link-fields.js";
export {
  SharedView,
  type SharedViewProps,
} from "./components/dimah-s3/share/shared-view.js";
```
