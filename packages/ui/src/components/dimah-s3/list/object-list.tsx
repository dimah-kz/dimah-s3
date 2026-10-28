"use client";

import { Fragment, type ReactNode } from "react";
import { AlertCircleIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import type { APIError } from "@dimah-s3/core";
import type { ObjectListFolder } from "@dimah-s3/react";
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
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeGlyph } from "@/lib/file-type-icon";

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
};

/**
 * Folder catalog. Renders `list` and does not fetch.
 * File rows stay generic: pass accessors, or replace a row with `renderItem`.
 */
export function ObjectList<TItem>({
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
  const showHeader = breadcrumb || header != null || isRefreshing;

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
        <div className="flex min-w-0 items-center gap-3 border-b border-dimah-s3-border px-3 py-2">
          {breadcrumb ? (
            <ObjectListBreadcrumb list={list} rootLabel={label} trail={trail} />
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
              <FolderRow
                key={folder.id}
                folder={folder}
                list={list}
                actions={renderFolderActions?.(folder)}
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
            const description = getDescription?.(item);
            return (
              <FileRow
                key={key}
                label={getLabel(item)}
                fileName={getFileName?.(item) ?? getLabel(item)}
                fileType={getFileType?.(item)}
                previewUrl={getPreviewUrl?.(item)}
                description={description}
                actions={renderActions?.(item)}
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

function FolderRow({
  folder,
  list,
  actions,
}: {
  folder: ObjectListFolder;
  list: ObjectListView<unknown>;
  actions?: ReactNode;
}) {
  const interactive = list.openFolder != null;
  return (
    <div role="listitem" className="flex min-w-0 items-center">
      <Item
        size="sm"
        className={cn(
          "min-w-0 flex-1",
          interactive && "cursor-pointer hover:bg-dimah-s3-muted",
        )}
        render={interactive ? <button type="button" /> : undefined}
        onClick={interactive ? () => list.openFolder?.(folder) : undefined}
      >
        <ItemMedia
          variant="icon"
          className="size-9 rounded-lg border border-dimah-s3-border bg-dimah-s3-secondary text-dimah-s3-foreground"
        >
          <FolderIcon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full min-w-0">{folder.name}</ItemTitle>
        </ItemContent>
      </Item>
      {actions ? <div className="pe-1.5">{actions}</div> : null}
    </div>
  );
}

function FileRow({
  label,
  fileName,
  fileType,
  previewUrl,
  description,
  actions,
}: {
  label: string;
  fileName: string;
  fileType?: string | null;
  previewUrl?: string | null;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const described =
    description != null && description !== false && description !== "";

  return (
    <Item role="listitem" size="sm" className="hover:bg-dimah-s3-muted">
      {previewUrl ? (
        <ItemMedia variant="image" className="size-9 rounded-lg">
          <img src={previewUrl} alt="" />
        </ItemMedia>
      ) : (
        <ItemMedia
          variant="icon"
          className="size-9 rounded-lg border border-dimah-s3-border bg-dimah-s3-muted"
        >
          <FileTypeGlyph fileName={fileName} fileType={fileType} />
        </ItemMedia>
      )}
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full min-w-0">{label}</ItemTitle>
        {described ? <ItemDescription>{description}</ItemDescription> : null}
      </ItemContent>
      {actions ? <ItemActions>{actions}</ItemActions> : null}
    </Item>
  );
}

function ObjectListSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="flex items-center gap-2.5 px-3 py-2.5">
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
