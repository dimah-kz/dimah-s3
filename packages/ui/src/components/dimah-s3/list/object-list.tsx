"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { APIError } from "@dimah-s3/core";
import type {
  ObjectListFolder,
  ObjectListUsage,
  UseDeleteReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
import { useFormatDimahError } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";
import { ObjectListBreadcrumb } from "@/components/dimah-s3/list/object-list-breadcrumb";
import {
  ObjectListRows,
  SelectCheckbox,
} from "@/components/dimah-s3/list/object-list-rows";
import { useObjectListSelection } from "@/components/dimah-s3/list/object-list-selection-state";
import { ObjectListSelection } from "@/components/dimah-s3/list/object-list-selection";
import {
  ObjectListContinue,
  ObjectListEmpty,
  ObjectListError,
  ObjectListErrorBanner,
  ObjectListSkeleton,
} from "@/components/dimah-s3/list/object-list-states";
import {
  ObjectListDropOverlay,
  ObjectListUpload,
  useRefreshListAfterUpload,
} from "@/components/dimah-s3/list/object-list-upload";
import { ObjectListUsageLine } from "@/components/dimah-s3/list/object-list-usage";

/**
 * List state. `{@link useObjectList}` returns this shape. A server render or
 * your own store can pass the same fields without the hook.
 */
export type ObjectListView<TItem> = {
  items: readonly TItem[];
  folders?: readonly ObjectListFolder[];
  /** Path from the root, root excluded. */
  trail?: readonly ObjectListFolder[];
  error?: APIError | null;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  isRefreshing?: boolean;
  hasMore?: boolean;
  loadMore?: () => void | Promise<void>;
  refresh?: () => void | Promise<void>;
  openFolder?: (folder: ObjectListFolder) => void;
  /** Pass `[]` for the root. */
  navigate?: (trail: readonly ObjectListFolder[]) => void;
  /**
   * Current folder id. Changing it clears the checkbox selection.
   * `useObjectList` sets this.
   */
  parent?: string | null;
  /**
   * Catalog totals. Omit it, or pass `null`, and the usage line stays hidden.
   * `useObjectList` sets this from the query.
   */
  usage?: ObjectListUsage | null;
};

/** Checked rows on the loaded page. */
export type ObjectListSelectionChange<TItem> = {
  items: readonly TItem[];
  folders: readonly ObjectListFolder[];
};

/** Caps for the usage line. The list does not read them from the server. */
export type ObjectListUsageLimits = {
  /**
   * Byte cap. Pass the same number as `db({ quota: { maxBytes } })` when
   * that plugin is what enforces the limit.
   */
  maxBytes?: number;
  /**
   * File-count cap. Pass the same number as `db({ quota: { maxFiles } })`
   * when that plugin is what enforces the limit.
   */
  maxFiles?: number;
};

/** Props for {@link ObjectList}. Pass a list view as `list`. */
export type ObjectListProps<TItem> = {
  list: ObjectListView<TItem>;
  getKey: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  getDescription?: (item: TItem) => ReactNode;
  /** Filename used for the type glyph. Defaults to `getLabel`. */
  getFileName?: (item: TItem) => string;
  getFileType?: (item: TItem) => string | null;
  /** Image thumbnail. The label stays the accessible name. */
  getPreviewUrl?: (item: TItem) => string | null;
  /** Replaces the file row. */
  renderItem?: (item: TItem) => ReactNode;
  /** Replaces the folder row. */
  renderFolder?: (folder: ObjectListFolder) => ReactNode;
  /** Trailing controls for a file, such as download and delete. */
  renderActions?: (item: TItem) => ReactNode;
  /**
   * Extra content beside the file name, such as a status.
   * Ignored when {@link ObjectListProps.renderItem} replaces the row.
   */
  renderMeta?: (item: TItem) => ReactNode;
  /**
   * Called when the default file row is clicked.
   * Ignored when {@link ObjectListProps.renderItem} replaces the row.
   */
  onOpenItem?: (item: TItem) => void;
  /** Trailing controls for a folder. Kept outside the open button. */
  renderFolderActions?: (folder: ObjectListFolder) => ReactNode;
  /** Trailing header content, such as an upload button. */
  header?: ReactNode;
  /** Root breadcrumb label. */
  rootLabel?: string;
  /** Show the path. @default true */
  breadcrumb?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Replaces the empty state.
   * When set, `emptyTitle` and `emptyDescription` are not used.
   */
  empty?: ReactNode;
  className?: string;
  /**
   * Fixed frame height. The header stays put and the rows scroll inside.
   * A number is pixels. A string is a CSS length, such as `"18rem"` or `"100%"`.
   */
  height?: number | string;
  /**
   * Largest frame height. The list grows with its content until this cap,
   * then the rows scroll and the header stays put.
   * A number is pixels. A string is a CSS length.
   */
  maxHeight?: number | string;
  /**
   * Checkboxes for the file rows loaded so far. The selection clears when
   * `list.parent` changes. Rows on the next page are not selected.
   * When `list.hasMore` is set, the header checkbox selects this page.
   * A folder gets a checkbox only when {@link ObjectListProps.resolveFolderKeys}
   * is set. Escape clears the selection. Ctrl+A or Cmd+A, with focus inside
   * the list, selects the same rows as the header checkbox.
   */
  selectable?: boolean;
  /**
   * S3 object key for a file. Defaults to `getKey`.
   * Bulk delete uses this, not the row id.
   */
  getObjectKey?: (item: TItem) => string;
  /**
   * Object keys stored in a folder. The folder gets a checkbox only when
   * this is set, and bulk delete includes the keys it returns.
   */
  resolveFolderKeys?: (folder: ObjectListFolder) => Promise<readonly string[]>;
  /** Selection bar delete. Implies {@link ObjectListProps.selectable}. */
  delete?: UseDeleteReturn;
  /**
   * Called when the checked rows change, including when the folder changes
   * and the selection clears. `items` and `folders` are from the loaded page.
   */
  onSelectionChange?: (selection: ObjectListSelectionChange<TItem>) => void;
  /**
   * Extra controls on the selection bar, beside Delete.
   * Implies {@link ObjectListProps.selectable}.
   */
  selectionActions?: ReactNode;
  /** Called after a bulk delete, including keys that failed. */
  onDeleted?: (result: { deleted: string[]; failed: string[] }) => void;
  /**
   * Drop and paste files onto this list. Pass `useUpload` with `noClick`
   * and `noKeyboard`. `getUploadOptions` chooses the folder from
   * `list.parent`; this component does not write metadata. Clicking the
   * list does not open the file picker. A paste uploads while focus is
   * inside the list. The destination is the open folder, including when
   * the pointer is over a folder row. When the batch settles and at least
   * one file succeeded, `list.refresh` runs once. A mixed batch still
   * reloads. Share this hook with `UploadButton` in `header` and set that
   * button's `toast` and `status` to false so progress stays here.
   */
  upload?: UseUploadReturn;
  /**
   * Caps drawn next to `list.usage`. Ignored when `list.usage` is omitted.
   * Without this, the line shows the totals and no meter.
   */
  usageLimits?: ObjectListUsageLimits;
};

/**
 * Folder catalog. Renders `list` and does not fetch.
 * File rows stay generic: pass accessors, or replace a row with `renderItem`.
 * When `list.hasMore` is set, the next page loads as the end of the rows
 * comes into view.
 */
export function ObjectList<TItem>(props: ObjectListProps<TItem>) {
  useRefreshListAfterUpload(props.upload, props.list.refresh);
  return <ObjectListFrame key={props.list.parent ?? ""} {...props} />;
}

function ObjectListFrame<TItem>({
  list,
  getKey,
  getLabel,
  getDescription,
  getFileName,
  getFileType,
  getPreviewUrl,
  renderItem,
  renderFolder,
  renderActions,
  renderMeta,
  onOpenItem,
  renderFolderActions,
  header,
  rootLabel,
  breadcrumb = true,
  emptyTitle,
  emptyDescription,
  empty,
  className,
  height,
  maxHeight,
  selectable = false,
  getObjectKey,
  resolveFolderKeys,
  delete: remove,
  onSelectionChange,
  selectionActions,
  onDeleted,
  upload,
  usageLimits,
}: ObjectListProps<TItem>) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const folders = useMemo(() => list.folders ?? [], [list.folders]);
  const trail = list.trail ?? [];
  const isLoading = list.isLoading === true;
  const isRefreshing = list.isRefreshing === true;
  const label = rootLabel ?? t("Files", { note: "object list" });
  const errorMessage = list.error ? formatError(list.error) : null;
  const showRows = folders.length > 0 || list.items.length > 0;
  const showEmpty = !isLoading && !list.error && !showRows;
  const showInitialError = !isLoading && list.error != null && !showRows;
  const canSelect =
    selectable ||
    remove != null ||
    selectionActions != null ||
    onSelectionChange != null;
  const filesSelectable = canSelect && renderItem == null;
  const foldersSelectable =
    canSelect && resolveFolderKeys != null && renderFolder == null;
  const selection = useObjectListSelection({
    items: list.items,
    folders,
    filesSelectable,
    foldersSelectable,
    getKey,
    getLabel,
    getFileName,
    getObjectKey,
    resolveFolderKeys,
    onSelectionChange,
  });
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const showHeader =
    breadcrumb ||
    header != null ||
    isRefreshing ||
    (selection.rowsSelectable && showRows);
  const pageLimited = list.hasMore === true;
  const busy = isLoading || isRefreshing || list.isLoadingMore === true;
  const frameHeight = cssLength(height);
  const frameMaxHeight = cssLength(maxHeight);
  const sized = frameHeight != null || frameMaxHeight != null;
  const frameStyle = sized
    ? {
        ...(frameHeight != null ? { height: frameHeight } : {}),
        ...(frameMaxHeight != null ? { maxHeight: frameMaxHeight } : {}),
      }
    : undefined;
  const frameClassName = cn(
    "relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground transition-colors",
    sized && "min-h-0",
    upload?.isDragReject &&
      "border-dimah-s3-destructive bg-dimah-s3-destructive/5",
    upload?.isDragAccept && "border-dimah-s3-primary bg-dimah-s3-primary/5",
    upload?.isDragActive &&
      !upload.isDragAccept &&
      !upload.isDragReject &&
      "border-dimah-s3-primary/50",
    className,
  );
  const frameProps = {
    "data-slot": "object-list",
    "aria-label": label,
    "aria-busy": busy || undefined,
    className: frameClassName,
  };
  const selectAll =
    selection.rowsSelectable && showRows ? (
      <SelectCheckbox
        checked={selection.allSelected}
        indeterminate={selection.selectedCount > 0 && !selection.allSelected}
        label={
          pageLimited
            ? t("Select this page", { note: "object list selection" })
            : t("Select all", { note: "object list selection" })
        }
        onCheckedChange={(checked) => selection.toggleAll(checked)}
      />
    ) : null;

  const sectionProps = {
    ...(upload
      ? upload.getRootProps({
          ...frameProps,
          role: "region",
          tabIndex: undefined,
          "aria-disabled": undefined,
          onClick: (event) => {
            event.stopPropagation();
          },
        })
      : frameProps),
    ...(frameStyle ? { style: frameStyle } : {}),
  };
  const emptyDescriptionText =
    emptyDescription ??
    (upload
      ? t("Drop files here to add them to this folder.", {
          note: "object list",
        })
      : t("Files and folders you add here will show up in this list.", {
          note: "object list",
        }));

  return (
    <section {...sectionProps}>
      <div className="shrink-0">
        {showHeader ? (
          <div
            className={cn(
              "border-b border-dimah-s3-border",
              selection.selecting && "bg-dimah-s3-primary/10",
            )}
          >
            {selection.selecting ? (
              <ObjectListSelection
                leading={selectAll}
                selectedCount={selection.selectedCount}
                onClear={selection.clearSelection}
                prepare={selection.prepareSelection}
                removeMany={remove?.removeMany}
                actions={selectionActions}
                onThisPage={pageLimited}
                onDeleted={(result) => {
                  selection.clearSelection();
                  onDeleted?.(result);
                  if (result.deleted.length > 0) void list.refresh?.();
                }}
              />
            ) : (
              <div className="flex min-h-11 min-w-0 items-center gap-2 py-1.5 ps-1.5 pe-1">
                {selectAll}
                {breadcrumb ? (
                  <ObjectListBreadcrumb
                    rootLabel={label}
                    trail={trail}
                    navigate={list.navigate}
                  />
                ) : (
                  <div className="min-w-0 flex-1" />
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {isRefreshing ? (
                    <Spinner
                      aria-label={t("Loading files", { note: "object list" })}
                    />
                  ) : null}
                  {header}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {list.usage ? (
          <ObjectListUsageLine usage={list.usage} limits={usageLimits} />
        ) : null}

        {upload ? <ObjectListUpload upload={upload} /> : null}
      </div>

      <div
        ref={sized ? setScroller : undefined}
        className={
          sized
            ? cn(
                "flex min-h-0 flex-col overflow-y-auto overscroll-y-contain",
                frameHeight != null ? "flex-1" : "flex-auto",
              )
            : undefined
        }
      >
        {isLoading ? <ObjectListSkeleton /> : null}

        {showInitialError ? (
          <ObjectListError message={errorMessage} onRetry={list.refresh} />
        ) : null}

        {showEmpty
          ? (empty ?? (
              <ObjectListEmpty
                title={
                  emptyTitle ??
                  t("This folder is empty", { note: "object list" })
                }
                description={emptyDescriptionText}
              />
            ))
          : null}

        {showRows ? (
          <ObjectListRows
            items={list.items}
            folders={folders}
            getKey={getKey}
            getLabel={getLabel}
            getDescription={getDescription}
            getFileName={getFileName}
            getFileType={getFileType}
            getPreviewUrl={getPreviewUrl}
            renderItem={renderItem}
            renderFolder={renderFolder}
            renderActions={renderActions}
            renderMeta={renderMeta}
            onOpenItem={onOpenItem}
            renderFolderActions={renderFolderActions}
            openFolder={list.openFolder}
            filesSelectable={filesSelectable}
            foldersSelectable={foldersSelectable}
            fileKeys={selection.fileKeys}
            folderIds={selection.folderIds}
            selectRow={selection.selectRow}
          />
        ) : null}

        {showRows && errorMessage ? (
          <ObjectListErrorBanner
            message={errorMessage}
            onRetry={list.refresh}
          />
        ) : null}

        <ObjectListContinue
          active={list.hasMore === true && list.loadMore != null}
          pending={list.isLoadingMore === true}
          blocked={list.error != null}
          loadMore={list.loadMore}
          root={sized ? scroller : null}
          ready={!sized || scroller != null}
        />
      </div>
      {upload ? <ObjectListDropOverlay upload={upload} /> : null}
    </section>
  );
}

/** A number is pixels. A blank string is unset. */
function cssLength(value: number | string | undefined) {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
