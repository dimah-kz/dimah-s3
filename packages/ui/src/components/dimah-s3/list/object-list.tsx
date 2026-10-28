"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircleIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { fileNameFromKey, type APIError } from "@dimah-s3/core";
import type {
  ObjectListFolder,
  UseDeleteReturn,
  UseNavigateDownloadReturn,
} from "@dimah-s3/react";
import { useFormatDimahError } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeGlyph } from "@/lib/file-type-icon";
import { ObjectListSelection } from "@/components/dimah-s3/list/object-list-selection";

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
   * Checkboxes for the rows loaded so far. The selection clears when
   * `list.parent` changes. Rows on the next page are not selected.
   */
  selectable?: boolean;
  /**
   * S3 object key for a file. Defaults to `getKey`.
   * Bulk delete uses this, not the row id.
   */
  getObjectKey?: (item: TItem) => string;
  /**
   * Object keys stored in a folder. Without it, a checked folder stays
   * in the list and is not deleted.
   */
  resolveFolderKeys?: (folder: ObjectListFolder) => Promise<readonly string[]>;
  /**
   * Selection bar download. Implies {@link ObjectListProps.selectable}.
   * Pass navigate-mode `useDownload`. A checked folder is included only
   * when {@link ObjectListProps.resolveFolderKeys} is set.
   */
  download?: UseNavigateDownloadReturn;
  /** Selection bar delete. Implies {@link ObjectListProps.selectable}. */
  delete?: UseDeleteReturn;
  /** Called after a bulk delete, including keys that failed. */
  onDeleted?: (result: { deleted: string[]; failed: string[] }) => void;
};

/**
 * Folder catalog. Renders `list` and does not fetch.
 * File rows stay generic: pass accessors, or replace a row with `renderItem`.
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
  renderFolderActions,
  header,
  rootLabel,
  breadcrumb = true,
  emptyTitle,
  emptyDescription,
  className,
  selectable = false,
  getObjectKey,
  resolveFolderKeys,
  download,
  delete: remove,
  onDeleted,
}: ObjectListProps<TItem>) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const folders = list.folders ?? [];
  const trail = list.trail ?? [];
  const isLoading = list.isLoading === true;
  const isRefreshing = list.isRefreshing === true;
  const label = rootLabel ?? t("Files", { note: "object list" });
  const errorMessage = list.error ? formatError(list.error) : null;
  const showRows = folders.length > 0 || list.items.length > 0;
  const showEmpty = !isLoading && !list.error && !showRows;
  const showInitialError = !isLoading && list.error != null && !showRows;
  const canSelect = selectable || remove != null || download != null;
  const [fileKeys, setFileKeys] = useState<ReadonlySet<string>>(new Set());
  const [folderIds, setFolderIds] = useState<ReadonlySet<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const visibleFileKeys = list.items.map((item) => getKey(item));
  const visibleFolderIds = folders.map((folder) => folder.id);
  const selectedFileKeys = visibleFileKeys.filter((key) => fileKeys.has(key));
  const selectedFolderIds = visibleFolderIds.filter((id) => folderIds.has(id));
  const selectedCount = selectedFileKeys.length + selectedFolderIds.length;
  const visibleCount = visibleFileKeys.length + visibleFolderIds.length;
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;
  const showHeader =
    breadcrumb || header != null || isRefreshing || (canSelect && showRows);
  const objectKeyOf = getObjectKey ?? getKey;
  const selecting = canSelect && selectedCount > 0;
  const canAct =
    selectedFileKeys.length > 0 ||
    (selectedFolderIds.length > 0 && resolveFolderKeys != null);
  const selectionRows: SelectionRow[] = [];
  if (!renderFolder) {
    for (const folder of folders) {
      selectionRows.push({ kind: "folder", id: folder.id });
    }
  }
  if (!renderItem) {
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

  const selectAll =
    canSelect && showRows ? (
      <SelectCheckbox
        checked={allSelected}
        indeterminate={selectedCount > 0 && !allSelected}
        label={t("Select all", { note: "object list selection" })}
        onCheckedChange={(checked) => toggleAll(checked)}
      />
    ) : null;

  return (
    <section
      data-slot="object-list"
      aria-label={label}
      aria-busy={isLoading || isRefreshing || list.isLoadingMore === true}
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground",
        className,
      )}
    >
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
              canAct={canAct}
              onClear={clearSelection}
              prepare={prepareSelection}
              download={download}
              removeMany={remove?.removeMany}
              onDeleted={(result) => {
                clearSelection();
                onDeleted?.(result);
                if (result.deleted.length > 0) void list.refresh?.();
              }}
            />
          ) : (
            <div className="flex min-h-11 min-w-0 items-center gap-2.5 py-1.5 ps-4 pe-2">
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
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>
              {emptyTitle ?? t("This folder is empty", { note: "object list" })}
            </EmptyTitle>
            <EmptyDescription>
              {emptyDescription ??
                t("Files and folders you add here will show up in this list.", {
                  note: "object list",
                })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {showRows ? (
        <ItemGroup className="gap-0.5 px-1.5 py-1.5">
          {folders.map((folder) =>
            renderFolder ? (
              <div key={folder.id} role="listitem">
                {renderFolder(folder)}
              </div>
            ) : (
              <ObjectListRow
                key={folder.id}
                title={folder.name}
                media={
                  <ItemMedia
                    variant="icon"
                    className="size-9 rounded-lg border border-dimah-s3-border bg-dimah-s3-secondary text-dimah-s3-foreground"
                  >
                    <FolderIcon />
                  </ItemMedia>
                }
                actions={renderFolderActions?.(folder)}
                selected={folderIds.has(folder.id)}
                selectable={canSelect}
                selectLabel={t("Select {name}", {
                  note: "object list selection",
                  variables: { name: folder.name },
                })}
                onSelect={
                  canSelect
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
                    <ItemMedia variant="image" className="size-9 rounded-lg">
                      <img src={previewUrl} alt="" />
                    </ItemMedia>
                  ) : (
                    <ItemMedia
                      variant="icon"
                      className="size-9 rounded-lg border border-dimah-s3-border bg-dimah-s3-muted"
                    >
                      <FileTypeGlyph
                        fileName={fileName}
                        fileType={getFileType?.(item)}
                      />
                    </ItemMedia>
                  )
                }
                actions={renderActions?.(item)}
                selected={fileKeys.has(key)}
                selectable={canSelect}
                selectLabel={t("Select {name}", {
                  note: "object list selection",
                  variables: { name: getLabel(item) },
                })}
                onSelect={
                  canSelect
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
        </ItemGroup>
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

      {list.hasMore ? (
        <div className="flex justify-center px-2 pt-0.5 pb-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={list.isLoadingMore === true || list.loadMore == null}
            onClick={() => void list.loadMore?.()}
          >
            {list.isLoadingMore ? <Spinner data-icon="inline-start" /> : null}
            {t("Load more", { note: "object list" })}
          </Button>
        </div>
      ) : null}
    </section>
  );
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
  const atRoot = trail.length === 0;

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
        {trail.map((folder, index) => {
          const current = index === trail.length - 1;
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
                    onClick={() => list.navigate?.(trail.slice(0, index + 1))}
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

function ObjectListRow({
  title,
  description,
  media,
  actions,
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
  selected: boolean;
  selectable: boolean;
  selectLabel: string;
  onSelect?: (checked: boolean, shiftKey: boolean) => void;
  onOpen?: () => void;
}) {
  const described =
    description != null && description !== false && description !== "";

  return (
    <div
      role="listitem"
      data-slot="object-list-row"
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg py-1.5 ps-2.5 pe-1.5 transition-colors duration-150",
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
          "min-w-0 flex-1 flex-nowrap rounded-none bg-transparent p-0 hover:bg-transparent",
          onOpen && "cursor-pointer self-stretch text-start",
        )}
        render={onOpen ? <button type="button" /> : undefined}
        onClick={onOpen}
      >
        {media}
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full min-w-0">{title}</ItemTitle>
          {described ? <ItemDescription>{description}</ItemDescription> : null}
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

function ObjectListSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
      {["a", "b", "c", "d"].map((key) => (
        <div
          key={key}
          className="flex items-center gap-2.5 py-1.5 ps-2.5 pe-1.5"
        >
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
