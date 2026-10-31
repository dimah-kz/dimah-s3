"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import {
  useFormatDate,
  useFormatFileSize,
  type DropTargetProps,
  type ObjectListEntry,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { FileTypeGlyph } from "@/components/dimah-s3/attachment/file-type-glyph";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";
import { ObjectListItemMenu } from "@/components/dimah-s3/list/object-list-item-menu";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { folderUploadCall } from "@/components/dimah-s3/list/object-list-upload";

/** Props shared by {@link ObjectListRow} and {@link ObjectListTile}. */
export type ObjectListEntryProps<TItem> = {
  entry: ObjectListEntry<TItem>;
  className?: string;
  /** Replaces the trailing controls. Defaults to `renderActions`. */
  actions?: ReactNode;
  /** Replaces the second line. Defaults to `renderDescription`. */
  description?: ReactNode;
  /** Beside the name. Defaults to `renderMeta`. */
  meta?: ReactNode;
  /** Replaces the icon or thumbnail. */
  media?: ReactNode;
};

/** Checkbox for an entry or the select-all control. Reports Shift. */
export function ObjectListCheckbox({
  checked,
  indeterminate,
  label,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onCheckedChange: (checked: boolean, shiftKey: boolean) => void;
  className?: string;
}) {
  const shiftRef = useRef(false);

  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      aria-label={label}
      className={cn("after:-inset-x-2 after:-inset-y-3", className)}
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

/** Highlight while files are dragged over a folder that takes drops. */
const DROP_TARGET =
  "data-drag-active:bg-dimah-s3-primary/10 data-drag-active:ring-2 data-drag-active:ring-dimah-s3-primary data-drag-active:ring-inset";

/** One row in the `list` view. */
export function ObjectListRow<TItem>(props: ObjectListEntryProps<TItem>) {
  const { entry, className } = props;
  const parts = useEntryParts(props);

  return (
    <div
      {...parts.dropTarget}
      data-slot="object-list-entry"
      data-kind={entry.kind}
      data-view="list"
      data-selected={parts.selected ? "" : undefined}
      className={cn(
        "grid min-h-11 min-w-0 items-center gap-2 overflow-hidden py-1 ps-1.5 pe-1 transition-colors duration-150",
        parts.checkbox
          ? parts.actions
            ? "grid-cols-[auto_minmax(0,1fr)_auto]"
            : "grid-cols-[auto_minmax(0,1fr)]"
          : parts.actions
            ? "grid-cols-[minmax(0,1fr)_auto]"
            : "grid-cols-[minmax(0,1fr)]",
        parts.selected
          ? "bg-dimah-s3-primary/10 hover:bg-dimah-s3-primary/15"
          : "hover:bg-dimah-s3-muted",
        DROP_TARGET,
        className,
      )}
    >
      {parts.checkbox}
      <EntryTrigger
        parts={parts}
        className="flex min-w-0 items-center gap-2.5 self-stretch rounded-md text-start"
      >
        <span className="flex size-8 shrink-0 items-center justify-center">
          {parts.media ?? (
            <EntryMedia entry={entry} className="size-8 rounded-[4px]" />
          )}
        </span>
        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            parts.actions && "pe-2",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="block w-full min-w-0 overflow-hidden text-sm leading-snug text-dimah-s3-foreground">
              <NameLabel entry={entry} />
            </span>
            {parts.meta ? <span className="shrink-0">{parts.meta}</span> : null}
          </span>
          {parts.description ? (
            <span className="min-w-0 truncate text-xs leading-4 text-dimah-s3-muted-foreground">
              {parts.description}
            </span>
          ) : null}
        </span>
      </EntryTrigger>
      {parts.actions ? <div className="shrink-0">{parts.actions}</div> : null}
    </div>
  );
}

/** One tile in the `grid` view. */
export function ObjectListTile<TItem>(props: ObjectListEntryProps<TItem>) {
  const { entry, className } = props;
  const parts = useEntryParts(props);

  return (
    <div
      {...parts.dropTarget}
      data-slot="object-list-entry"
      data-kind={entry.kind}
      data-view="grid"
      data-selected={parts.selected ? "" : undefined}
      className={cn(
        "group/entry relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border transition-colors duration-150",
        parts.selected
          ? "border-dimah-s3-primary bg-dimah-s3-primary/10"
          : "border-dimah-s3-border hover:bg-dimah-s3-muted",
        DROP_TARGET,
        className,
      )}
    >
      <EntryTrigger
        parts={parts}
        className="flex h-full min-w-0 flex-col text-start"
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-dimah-s3-muted/60">
          {parts.media ?? <EntryMedia entry={entry} tile />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="block min-w-0 flex-1 overflow-hidden text-sm leading-snug text-dimah-s3-foreground">
              <NameLabel entry={entry} />
            </span>
            {parts.meta ? <span className="shrink-0">{parts.meta}</span> : null}
          </span>
          {parts.description ? (
            <span className="min-w-0 truncate text-xs leading-4 text-dimah-s3-muted-foreground">
              {parts.description}
            </span>
          ) : null}
        </span>
      </EntryTrigger>
      {parts.checkbox ? (
        <span
          className={cn(
            "absolute start-2 top-2 flex rounded-[4px] bg-dimah-s3-card/90 transition-opacity",
            !parts.selected &&
              !parts.selecting &&
              "opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          {parts.checkbox}
        </span>
      ) : null}
      {parts.actions ? (
        <span className="absolute end-1 top-1 flex rounded-md bg-dimah-s3-card/90">
          {parts.actions}
        </span>
      ) : null}
    </div>
  );
}

type EntryParts = {
  selected: boolean;
  /** Any entry in the list is selected. */
  selecting: boolean;
  checkbox: ReactNode;
  actions: ReactNode;
  description: ReactNode;
  meta: ReactNode;
  media: ReactNode;
  /** Drag and drop handlers on a folder that takes uploads, or `null`. */
  dropTarget: DropTargetProps | null;
  entryKey: string;
  /** `null` when the entry neither opens nor selects. */
  onClick: ((event: MouseEvent<HTMLElement>) => void) | null;
};

/** Selection, open, and slot content for one entry. */
function useEntryParts<TItem>({
  entry,
  actions,
  description,
  meta,
  media,
}: ObjectListEntryProps<TItem>): EntryParts {
  const t = useTranslations();
  const context = useObjectListContext<TItem>();
  const { list, selection, upload, onOpenItem } = context;
  const defaultDescription = useDefaultDescription(entry);
  const selectable = selection != null && selection.canSelect(entry);
  const selected = selectable && selection.isSelected(entry.key);
  const open =
    entry.kind === "folder"
      ? () => list.openFolder(entry.folder)
      : onOpenItem
        ? () => onOpenItem(entry.item)
        : null;

  // Folders take dropped files only when the source can place them there.
  const folderCall =
    entry.kind === "folder" && upload
      ? folderUploadCall(list, entry.id)
      : undefined;
  const hasMenu =
    entry.kind === "file"
      ? context.download != null ||
        context.share != null ||
        context.delete != null
      : folderCall != null;

  const resolvedActions =
    actions !== undefined ? (
      actions
    ) : context.renderActions ? (
      context.renderActions(entry)
    ) : hasMenu ? (
      <ObjectListItemMenu />
    ) : null;

  return {
    selected,
    selecting: selection?.isSelecting === true,
    checkbox:
      selectable && selection ? (
        <ObjectListCheckbox
          checked={selected}
          label={t("Select {name}", {
            note: "object list selection",
            variables: { name: entry.name },
          })}
          onCheckedChange={(checked, shiftKey) =>
            selection.toggle(entry.key, { value: checked, range: shiftKey })
          }
        />
      ) : null,
    actions: present(resolvedActions),
    description: present(
      description !== undefined
        ? description
        : context.renderDescription
          ? context.renderDescription(entry)
          : defaultDescription,
    ),
    meta: present(meta !== undefined ? meta : context.renderMeta?.(entry)),
    media: present(media),
    dropTarget:
      upload && folderCall ? upload.getDropTargetProps({}, folderCall) : null,
    entryKey: entry.key,
    onClick:
      open || selectable
        ? (event) => {
            if (selectable && selection) {
              if (event.metaKey || event.ctrlKey) {
                selection.toggle(entry.key);
                return;
              }
              if (event.shiftKey) {
                selection.toggle(entry.key, { range: true, value: true });
                return;
              }
            }
            if (open) open();
            else selection?.toggle(entry.key);
          }
        : null,
  };
}

/** The button that opens or selects an entry. Arrow keys move between these. */
function EntryTrigger({
  parts,
  className,
  children,
}: {
  parts: EntryParts;
  className?: string;
  children: ReactNode;
}) {
  const focusRing =
    "outline-none focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50";
  if (!parts.onClick) {
    return <div className={className}>{children}</div>;
  }
  return (
    <button
      type="button"
      data-slot="object-list-entry-trigger"
      data-entry-key={parts.entryKey}
      className={cn("cursor-pointer select-none", focusRing, className)}
      onClick={parts.onClick}
    >
      {children}
    </button>
  );
}

/** Thumbnail, file glyph, or folder glyph. */
function EntryMedia<TItem>({
  entry,
  tile = false,
  className,
}: {
  entry: ObjectListEntry<TItem>;
  tile?: boolean;
  className?: string;
}) {
  if (entry.kind === "folder") {
    return <FolderGlyph className={tile ? "size-14" : undefined} />;
  }
  const { file } = entry;
  if (file.previewUrl) {
    return (
      <img
        src={file.previewUrl}
        alt=""
        draggable={false}
        decoding="async"
        loading="lazy"
        className={cn("shrink-0 object-cover", tile ? "size-full" : className)}
      />
    );
  }
  return tile ? (
    <span className="flex size-16 items-center justify-center">
      <FileTypeGlyph fileName={file.name} contentType={file.contentType} />
    </span>
  ) : (
    <FileTypeGlyph
      layout="icon"
      fileName={file.name}
      contentType={file.contentType}
    />
  );
}

/** Size and date of a file. Folders have none. */
function useDefaultDescription<TItem>(entry: ObjectListEntry<TItem>) {
  const formatFileSize = useFormatFileSize();
  const formatDate = useFormatDate();
  if (entry.kind === "folder") return null;
  const parts = [
    entry.file.size != null ? formatFileSize(entry.file.size) : "",
    formatDate(entry.file.updatedAt),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function present(node: ReactNode): ReactNode {
  return node == null || node === false || node === "" ? null : node;
}

/** A short suffix after the last dot. Longer or odd suffixes stay in the stem. */
const FILE_EXTENSION = /^\.[a-z0-9]{1,8}$/i;

function splitFileName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, extension: "" };
  const extension = name.slice(dot);
  if (!FILE_EXTENSION.test(extension)) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension };
}

/**
 * An inline isolate: the name starts at the entry's start edge whatever its
 * script, and the entry keeps its own direction. A file keeps its extension
 * visible and puts the ellipsis on the stem, as on file attachments.
 */
function NameLabel<TItem>({ entry }: { entry: ObjectListEntry<TItem> }) {
  const { stem, extension } =
    entry.kind === "file"
      ? splitFileName(entry.name)
      : { stem: entry.name, extension: "" };
  return (
    <span
      dir="auto"
      title={entry.name}
      className="inline-flex max-w-full min-w-0 align-top"
    >
      <span className="min-w-0 truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}
