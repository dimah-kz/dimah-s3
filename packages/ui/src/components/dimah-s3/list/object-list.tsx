"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircleIcon } from "lucide-react";
import { fileNameFromKey, formatFileSize, type APIError } from "@dimah-s3/core";
import type {
  ObjectListFolder,
  ObjectListUsage,
  UseDeleteReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
import { useFormatDimahError } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeGlyph, FolderGlyph } from "@/lib/file-type-icon";
import { ObjectListSelection } from "@/components/dimah-s3/list/object-list-selection";
import { useUploadUi } from "@/hooks/use-upload-ui";

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
   * is set.
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
  const [fileKeys, setFileKeys] = useState<ReadonlySet<string>>(new Set());
  const [folderIds, setFolderIds] = useState<ReadonlySet<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const visibleFileKeys = filesSelectable
    ? list.items.map((item) => getKey(item))
    : [];
  const visibleFolderIds = foldersSelectable
    ? folders.map((folder) => folder.id)
    : [];
  const selectedFileKeys = visibleFileKeys.filter((key) => fileKeys.has(key));
  const selectedFolderIds = visibleFolderIds.filter((id) => folderIds.has(id));
  const selectedFileKeySig = JSON.stringify(selectedFileKeys);
  const selectedFolderIdSig = JSON.stringify(selectedFolderIds);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const getKeyRef = useRef(getKey);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
    getKeyRef.current = getKey;
  }, [getKey, onSelectionChange]);

  useEffect(() => {
    const notify = onSelectionChangeRef.current;
    if (!notify) return;
    const fileSet = new Set<string>(JSON.parse(selectedFileKeySig) as string[]);
    const folderSet = new Set<string>(
      JSON.parse(selectedFolderIdSig) as string[],
    );
    notify({
      items: list.items.filter((item) => fileSet.has(getKeyRef.current(item))),
      folders: folders.filter((folder) => folderSet.has(folder.id)),
    });
  }, [folders, list.items, selectedFileKeySig, selectedFolderIdSig]);
  const selectedCount = selectedFileKeys.length + selectedFolderIds.length;
  const visibleCount = visibleFileKeys.length + visibleFolderIds.length;
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;
  const rowsSelectable = filesSelectable || foldersSelectable;
  const showHeader =
    breadcrumb ||
    header != null ||
    isRefreshing ||
    (rowsSelectable && showRows);
  const objectKeyOf = getObjectKey ?? getKey;
  const selecting = rowsSelectable && selectedCount > 0;
  const selectionRows: SelectionRow[] = [];
  if (foldersSelectable) {
    for (const folder of folders) {
      selectionRows.push({ kind: "folder", id: folder.id });
    }
  }
  if (filesSelectable) {
    for (const item of list.items) {
      selectionRows.push({ kind: "file", id: getKey(item) });
    }
  }

  function toggleAll(checked: boolean) {
    anchorRef.current = null;
    setFileKeys(checked ? new Set(visibleFileKeys) : new Set());
    setFolderIds(checked ? new Set(visibleFolderIds) : new Set());
  }

  function clearSelection() {
    anchorRef.current = null;
    setFileKeys(new Set());
    setFolderIds(new Set());
  }

  function selectAt(index: number, checked: boolean, shift: boolean) {
    const row = selectionRows[index];
    if (!row) return;
    if (shift && anchorRef.current != null) {
      const start = Math.min(anchorRef.current, index);
      const end = Math.max(anchorRef.current, index);
      const files = new Set(fileKeys);
      const nextFolders = new Set(folderIds);
      for (let cursor = start; cursor <= end; cursor++) {
        const entry = selectionRows[cursor];
        if (!entry) continue;
        if (entry.kind === "file") files.add(entry.id);
        else nextFolders.add(entry.id);
      }
      setFileKeys(files);
      setFolderIds(nextFolders);
      return;
    }
    if (row.kind === "file") {
      setFileKeys((current) => replaceMember(current, row.id, checked));
    } else {
      setFolderIds((current) => replaceMember(current, row.id, checked));
    }
    anchorRef.current = index;
  }

  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isFieldTarget(event.target) || isOverlayTarget(event.target)) return;
      event.preventDefault();
      anchorRef.current = null;
      setFileKeys(new Set());
      setFolderIds(new Set());
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting]);

  async function prepareSelection() {
    const entries: { key: string; fileName?: string }[] = [];
    const seen = new Set<string>();
    function add(key: string, fileName?: string) {
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ key, fileName });
    }
    for (const item of list.items) {
      if (!fileKeys.has(getKey(item))) continue;
      add(objectKeyOf(item), getFileName?.(item) ?? getLabel(item));
    }
    let skippedFolders = 0;
    for (const folder of folders) {
      if (!folderIds.has(folder.id)) continue;
      if (!resolveFolderKeys) {
        skippedFolders += 1;
        continue;
      }
      for (const key of await resolveFolderKeys(folder)) {
        add(key, fileNameFromKey(key));
      }
    }
    return { entries, skippedFolders };
  }

  const pageLimited = list.hasMore === true;
  const busy = isLoading || isRefreshing || list.isLoadingMore === true;
  const dropLabel = upload?.isDragReject
    ? t("These files cannot be uploaded", { note: "object list" })
    : t("Drop to upload into this folder", { note: "object list" });
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
    rowsSelectable && showRows ? (
      <SelectCheckbox
        checked={allSelected}
        indeterminate={selectedCount > 0 && !allSelected}
        label={
          pageLimited
            ? t("Select this page", { note: "object list selection" })
            : t("Select all", { note: "object list selection" })
        }
        onCheckedChange={(checked) => toggleAll(checked)}
      />
    ) : null;

  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

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

  return (
    <section {...sectionProps}>
      <div className="shrink-0">
        {showHeader ? (
          <div
            className={cn(
              "border-b border-dimah-s3-border",
              selecting && "bg-dimah-s3-primary/10",
            )}
          >
            {selecting ? (
              <ObjectListSelection
                leading={selectAll}
                selectedCount={selectedCount}
                onClear={clearSelection}
                prepare={prepareSelection}
                removeMany={remove?.removeMany}
                actions={selectionActions}
                onThisPage={pageLimited}
                onDeleted={(result) => {
                  clearSelection();
                  onDeleted?.(result);
                  if (result.deleted.length > 0) void list.refresh?.();
                }}
              />
            ) : (
              <div className="flex min-h-11 min-w-0 items-center gap-2 py-1.5 ps-1.5 pe-1">
                {selectAll}
                {breadcrumb ? (
                  <ObjectListBreadcrumb
                    list={list}
                    rootLabel={label}
                    trail={trail}
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

        {upload ? (
          <ObjectListUpload upload={upload} refresh={list.refresh} />
        ) : null}
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
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlertCircleIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("Could not load files", { note: "object list" })}
              </EmptyTitle>
              {errorMessage ? (
                <EmptyDescription className="[overflow-wrap:anywhere]">
                  {errorMessage}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
            {list.refresh ? (
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void list.refresh?.()}
                >
                  {t("Retry", { note: "object list" })}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : null}

        {showEmpty ? (
          <Empty className="border-0">
            <EmptyHeader>
              <FolderGlyph className="mb-1 size-12" />
              <EmptyTitle>
                {emptyTitle ??
                  t("This folder is empty", { note: "object list" })}
              </EmptyTitle>
              <EmptyDescription>
                {emptyDescription ??
                  (upload
                    ? t("Drop files here to add them to this folder.", {
                        note: "object list",
                      })
                    : t(
                        "Files and folders you add here will show up in this list.",
                        { note: "object list" },
                      ))}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {showRows ? (
          <div role="list" className="flex min-w-0 flex-col">
            {folders.map((folder) =>
              renderFolder ? (
                <div key={folder.id} role="listitem">
                  {renderFolder(folder)}
                </div>
              ) : (
                <ObjectListRow
                  key={folder.id}
                  title={folder.name}
                  media={<FolderGlyph />}
                  actions={renderFolderActions?.(folder)}
                  selected={folderIds.has(folder.id)}
                  selectable={foldersSelectable}
                  selectLabel={t("Select {name}", {
                    note: "object list selection",
                    variables: { name: folder.name },
                  })}
                  onSelect={
                    foldersSelectable
                      ? (checked, shift) =>
                          selectAt(
                            selectionRows.findIndex(
                              (row) =>
                                row.kind === "folder" && row.id === folder.id,
                            ),
                            checked,
                            shift,
                          )
                      : undefined
                  }
                  onOpen={
                    list.openFolder != null
                      ? () => list.openFolder?.(folder)
                      : undefined
                  }
                />
              ),
            )}
            {list.items.map((item) => {
              const key = getKey(item);
              if (renderItem) {
                return (
                  <div key={key} role="listitem">
                    {renderItem(item)}
                  </div>
                );
              }
              const fileName = getFileName?.(item) ?? getLabel(item);
              const previewUrl = getPreviewUrl?.(item);
              return (
                <ObjectListRow
                  key={key}
                  title={getLabel(item)}
                  description={getDescription?.(item)}
                  media={
                    previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-[4px] object-cover"
                      />
                    ) : (
                      <FileTypeGlyph
                        layout="icon"
                        fileName={fileName}
                        fileType={getFileType?.(item)}
                      />
                    )
                  }
                  actions={renderActions?.(item)}
                  meta={renderMeta?.(item)}
                  selected={fileKeys.has(key)}
                  selectable={filesSelectable}
                  selectLabel={t("Select {name}", {
                    note: "object list selection",
                    variables: { name: getLabel(item) },
                  })}
                  onOpen={
                    onOpenItem != null ? () => onOpenItem(item) : undefined
                  }
                  onSelect={
                    filesSelectable
                      ? (checked, shift) =>
                          selectAt(
                            selectionRows.findIndex(
                              (row) => row.kind === "file" && row.id === key,
                            ),
                            checked,
                            shift,
                          )
                      : undefined
                  }
                />
              );
            })}
          </div>
        ) : null}

        {showRows && errorMessage ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-t border-dimah-s3-border px-3 py-2"
          >
            <p className="min-w-0 text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive">
              {errorMessage}
            </p>
            {list.refresh ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void list.refresh?.()}
              >
                {t("Retry", { note: "object list" })}
              </Button>
            ) : null}
          </div>
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
      {upload?.isDragActive ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-dimah-s3-card/80 p-6"
        >
          <p
            className={cn(
              "rounded-md border border-dashed px-3 py-2 text-sm",
              upload.isDragReject
                ? "border-dimah-s3-destructive text-dimah-s3-destructive"
                : "border-dimah-s3-primary text-dimah-s3-primary",
            )}
          >
            {dropLabel}
          </p>
        </div>
      ) : null}
      {upload ? (
        <div className="sr-only" aria-live="polite">
          {upload.isDragActive ? dropLabel : ""}
        </div>
      ) : null}
    </section>
  );
}

/** Loads the next page when the end of the rows is on screen. */
function ObjectListContinue({
  active,
  pending,
  blocked,
  loadMore,
  root,
  ready,
}: {
  active: boolean;
  pending: boolean;
  blocked: boolean;
  loadMore?: () => void | Promise<void>;
  /** Scroll parent. `null` uses the viewport. */
  root: HTMLElement | null;
  ready: boolean;
}) {
  const t = useTranslations();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !ready || !active || pending || blocked) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadMoreRef.current?.();
      },
      { root, rootMargin: "48px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, blocked, pending, ready, root]);

  if (!active && !pending) return null;

  return (
    <div className="flex shrink-0 flex-col">
      {pending ? (
        <div className="flex justify-center py-2">
          <Spinner aria-label={t("Loading files", { note: "object list" })} />
        </div>
      ) : null}
      {active ? (
        <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />
      ) : null}
    </div>
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

/** Trailing folders kept inline. Earlier ones collapse into a menu. */
const VISIBLE_TRAIL = 2;

function splitObjectListTrail(trail: readonly ObjectListFolder[]) {
  if (trail.length <= VISIBLE_TRAIL) {
    return { hidden: [] as readonly ObjectListFolder[], visible: trail };
  }
  return {
    hidden: trail.slice(0, -VISIBLE_TRAIL),
    visible: trail.slice(-VISIBLE_TRAIL),
  };
}

function ObjectListBreadcrumb({
  list,
  rootLabel,
  trail,
}: {
  list: ObjectListView<unknown>;
  rootLabel: string;
  trail: readonly ObjectListFolder[];
}) {
  const t = useTranslations();
  const atRoot = trail.length === 0;
  const { hidden, visible } = splitObjectListTrail(trail);

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="min-w-0 flex-nowrap">
        <BreadcrumbItem className="min-w-0">
          {atRoot || list.navigate == null ? (
            <BreadcrumbPage className="max-w-40 truncate sm:max-w-56">
              {rootLabel}
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              className="max-w-40 truncate sm:max-w-56"
              render={<button type="button" />}
              onClick={() => list.navigate?.([])}
            >
              {rootLabel}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {hidden.length > 0 ? (
          <Fragment>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1">
                  <BreadcrumbEllipsis className="size-4" />
                  <span className="sr-only">
                    {t("Earlier folders", { note: "object list" })}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-w-64 min-w-48"
                >
                  <DropdownMenuGroup>
                    {hidden.map((folder, index) => (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={list.navigate == null}
                        onClick={() =>
                          list.navigate?.(trail.slice(0, index + 1))
                        }
                      >
                        <span className="truncate">{folder.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </Fragment>
        ) : null}
        {visible.map((folder, index) => {
          const trailIndex = hidden.length + index;
          const current = trailIndex === trail.length - 1;
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {current || list.navigate == null ? (
                  <BreadcrumbPage className="max-w-40 truncate sm:max-w-56">
                    {folder.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="max-w-40 truncate sm:max-w-56"
                    render={<button type="button" />}
                    onClick={() =>
                      list.navigate?.(trail.slice(0, trailIndex + 1))
                    }
                  >
                    {folder.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

type SelectionRow = { kind: "file" | "folder"; id: string };

/** A short suffix after the last dot. Longer or odd suffixes stay in the stem. */
const FILE_EXTENSION = /^\.[a-z0-9]{1,8}$/i;

function splitFileName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, extension: "" };
  const extension = name.slice(dot);
  if (!FILE_EXTENSION.test(extension)) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension };
}

/** Ellipsis on the stem. The extension stays visible, as on file attachments. */
function FileNameLabel({ name }: { name: string }) {
  const { stem, extension } = splitFileName(name);
  return (
    <span dir="auto" title={name} className="flex max-w-full min-w-0">
      <span className="min-w-0 truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}

function ObjectListRow({
  title,
  description,
  media,
  actions,
  meta,
  selected,
  selectable,
  selectLabel,
  onSelect,
  onOpen,
}: {
  title: string;
  description?: ReactNode;
  media: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  selected: boolean;
  selectable: boolean;
  selectLabel: string;
  onSelect?: (checked: boolean, shiftKey: boolean) => void;
  onOpen?: () => void;
}) {
  const described =
    description != null && description !== false && description !== "";
  const showMeta = meta != null && meta !== false && meta !== "";
  const columns = selectable
    ? actions
      ? "grid-cols-[auto_minmax(0,1fr)_auto]"
      : "grid-cols-[auto_minmax(0,1fr)]"
    : actions
      ? "grid-cols-[minmax(0,1fr)_auto]"
      : "grid-cols-[minmax(0,1fr)]";

  return (
    <div
      role="listitem"
      data-slot="object-list-row"
      className={cn(
        "grid min-h-11 min-w-0 items-center gap-2 overflow-hidden py-1 ps-1.5 pe-1 transition-colors duration-150",
        columns,
        selected
          ? "bg-dimah-s3-primary/10 hover:bg-dimah-s3-primary/15"
          : "hover:bg-dimah-s3-muted",
      )}
    >
      {selectable && onSelect ? (
        <SelectCheckbox
          checked={selected}
          label={selectLabel}
          onCheckedChange={onSelect}
        />
      ) : null}
      <Item
        size="sm"
        className={cn(
          "w-full min-w-0 flex-nowrap overflow-hidden rounded-none bg-transparent p-0 hover:bg-transparent",
          onOpen && "cursor-pointer self-stretch text-start",
        )}
        render={onOpen ? <button type="button" /> : undefined}
        onClick={onOpen}
      >
        <span className="shrink-0">{media}</span>
        <ItemContent
          className={cn("min-w-0 gap-0 overflow-hidden", actions && "pe-2")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ItemTitle className="line-clamp-none block w-full min-w-0 overflow-hidden font-normal">
              <FileNameLabel name={title} />
            </ItemTitle>
            {showMeta ? <div className="shrink-0">{meta}</div> : null}
          </div>
          {described ? (
            <ItemDescription className="min-w-0 truncate text-xs leading-4 text-dimah-s3-muted-foreground">
              {description}
            </ItemDescription>
          ) : null}
        </ItemContent>
      </Item>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function SelectCheckbox({
  checked,
  indeterminate,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onCheckedChange: (checked: boolean, shiftKey: boolean) => void;
}) {
  const shiftRef = useRef(false);

  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      aria-label={label}
      className="after:-inset-x-2 after:-inset-y-3"
      onPointerDown={(event) => {
        shiftRef.current = event.shiftKey;
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          shiftRef.current = event.shiftKey;
        }
      }}
      onCheckedChange={(value) => {
        onCheckedChange(value, shiftRef.current);
        shiftRef.current = false;
      }}
    />
  );
}

function isFieldTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

function isOverlayTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "[role=dialog], [role=alertdialog], [role=menu], [data-slot=dropdown-menu-content], [data-slot=alert-dialog-content]",
      ),
    )
  );
}

function replaceMember(
  current: ReadonlySet<string>,
  id: string,
  checked: boolean,
) {
  const next = new Set(current);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

function ObjectListUsageLine({
  usage,
  limits,
}: {
  usage: ObjectListUsage;
  limits?: ObjectListUsageLimits;
}) {
  const t = useTranslations();
  const byteCap = finiteCap(limits?.maxBytes);
  const fileCap = finiteCap(limits?.maxFiles);
  const bytesLabel =
    byteCap == null
      ? formatFileSize(usage.totalBytes)
      : t("{used} of {max}", {
          note: "object list usage",
          variables: {
            used: formatFileSize(usage.totalBytes),
            max: formatFileSize(byteCap),
          },
        });
  const filesLabel =
    fileCap == null
      ? usage.objectCount === 1
        ? t("1 file", { note: "object list usage" })
        : t("{count} files", {
            note: "object list usage",
            variables: { count: String(usage.objectCount) },
          })
      : t("{count} of {max} files", {
          note: "object list usage",
          variables: {
            count: String(usage.objectCount),
            max: String(fileCap),
          },
        });
  const byteRatio = fillRatio(usage.totalBytes, byteCap);
  const fileRatio = fillRatio(usage.objectCount, fileCap);
  const tightest = tightestRatio(byteRatio, fileRatio);
  const over = tightest != null && tightest >= 1;
  const percent =
    tightest == null ? null : Math.min(100, Math.round(tightest * 100));

  return (
    <div className="flex flex-col gap-1.5 border-b border-dimah-s3-border px-3 py-2">
      <p
        className={cn(
          "text-xs tabular-nums",
          over ? "text-dimah-s3-destructive" : "text-dimah-s3-muted-foreground",
        )}
      >
        {bytesLabel}
        <span aria-hidden> · </span>
        {filesLabel}
      </p>
      {percent != null ? (
        <div
          className="flex h-1 overflow-hidden rounded-full bg-dimah-s3-muted"
          aria-hidden
        >
          <div
            className={cn(
              "h-full",
              over ? "bg-dimah-s3-destructive" : "bg-dimah-s3-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function finiteCap(value: number | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function fillRatio(used: number, max: number | null) {
  if (max == null) return null;
  if (max === 0) return used > 0 ? 1 : 0;
  return used / max;
}

function tightestRatio(byteRatio: number | null, fileRatio: number | null) {
  if (byteRatio == null) return fileRatio;
  if (fileRatio == null) return byteRatio;
  return Math.max(byteRatio, fileRatio);
}

function ObjectListUpload({
  upload,
  refresh,
}: {
  upload: UseUploadReturn;
  refresh?: () => void | Promise<void>;
}) {
  const { statusNode } = useUploadUi(upload);
  useRefreshListAfterUpload(upload, refresh);
  if (upload.phase === "idle" || upload.phase === "success") return null;
  return (
    <div className="border-b border-dimah-s3-border px-3 py-2">
      {statusNode}
    </div>
  );
}

function useRefreshListAfterUpload(
  upload: UseUploadReturn,
  refresh: (() => void | Promise<void>) | undefined,
) {
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef(refresh);
  const successIds = upload.files
    .filter((file) => file.status === "success")
    .map((file) => file.id)
    .join("\0");
  const settled = !upload.isPending && upload.phase !== "idle";

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!settled) {
      tokenRef.current = null;
      return;
    }
    if (!successIds) return;
    if (tokenRef.current === successIds) return;
    tokenRef.current = successIds;
    void refreshRef.current?.();
  }, [settled, successIds]);
}

function ObjectListSkeleton() {
  return (
    <div className="flex flex-col">
      {["a", "b", "c", "d"].map((key) => (
        <div
          key={key}
          className="flex min-h-11 items-center gap-2 py-1 ps-1.5 pe-1"
        >
          <Skeleton className="size-8 rounded-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-16 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
