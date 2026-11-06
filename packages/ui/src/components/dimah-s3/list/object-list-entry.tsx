"use client";

import { memo, useRef, type MouseEvent, type ReactNode } from "react";
import {
  useFormatDate,
  useFormatFileSize,
  type DropTargetProps,
  type ObjectListEntry,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { FileName } from "@/components/dimah-s3/attachment/file-name";
import { FileTypeGlyph } from "@/components/dimah-s3/attachment/file-type-glyph";
import { FolderGlyph } from "@/components/dimah-s3/attachment/folder-glyph";
import { ObjectListItemMenu } from "@/components/dimah-s3/list/object-list-item-menu";
import {
  useObjectListEntryScope,
  useObjectListEntryStatus,
} from "@/components/dimah-s3/list/object-list-context";
import { ObjectListRenameField } from "@/components/dimah-s3/list/object-list-rename";

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
  tabIndex,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onCheckedChange: (checked: boolean, shiftKey: boolean) => void;
  /** `-1` inside an entry: arrow keys and Tab from the entry reach it. */
  tabIndex?: number;
  className?: string;
}) {
  const shiftRef = useRef(false);

  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      tabIndex={tabIndex}
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

/**
 * One row in the `list` view. Memoized: it draws again when its props or
 * its own state change, not on every change of the list.
 */
export const ObjectListRow = memo(function ObjectListRow<TItem>(
  props: ObjectListEntryProps<TItem>,
) {
  const { entry, className } = props;
  const parts = useEntryParts(props);

  return (
    <div
      {...parts.dropTarget}
      data-drop-name={parts.dropTarget ? entry.name : undefined}
      data-slot="object-list-entry"
      data-entry-key={entry.key}
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
      {parts.renaming ? (
        <div className="flex min-w-0 items-center gap-2.5 self-stretch">
          <span className="flex size-8 shrink-0 items-center justify-center">
            {parts.media ?? (
              <EntryMedia entry={entry} className="size-8 rounded-[4px]" />
            )}
          </span>
          <ObjectListRenameField entry={entry} />
        </div>
      ) : (
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
                <FileName name={entry.name} extension={entry.kind === "file"} />
              </span>
              {parts.meta ? (
                <span className="shrink-0">{parts.meta}</span>
              ) : null}
            </span>
            {parts.description ? (
              <span className="min-w-0 truncate text-xs leading-4 text-dimah-s3-muted-foreground">
                {parts.description}
              </span>
            ) : null}
          </span>
        </EntryTrigger>
      )}
      {parts.actions ? <div className="shrink-0">{parts.actions}</div> : null}
    </div>
  );
}) as <TItem>(props: ObjectListEntryProps<TItem>) => ReactNode;

/** One tile in the `grid` view. Memoized like {@link ObjectListRow}. */
export const ObjectListTile = memo(function ObjectListTile<TItem>(
  props: ObjectListEntryProps<TItem>,
) {
  const { entry, className } = props;
  const parts = useEntryParts(props);

  return (
    <div
      {...parts.dropTarget}
      data-drop-name={parts.dropTarget ? entry.name : undefined}
      data-slot="object-list-entry"
      data-entry-key={entry.key}
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
      {parts.renaming ? (
        <div className="flex h-full min-w-0 flex-col">
          <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-dimah-s3-muted/60">
            {parts.media ?? <EntryMedia entry={entry} tile />}
          </span>
          <span className="min-w-0 px-2 py-1.5">
            <ObjectListRenameField entry={entry} />
          </span>
        </div>
      ) : (
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
                <FileName name={entry.name} extension={entry.kind === "file"} />
              </span>
              {parts.meta ? (
                <span className="shrink-0">{parts.meta}</span>
              ) : null}
            </span>
            {parts.description ? (
              <span className="min-w-0 truncate text-xs leading-4 text-dimah-s3-muted-foreground">
                {parts.description}
              </span>
            ) : null}
          </span>
        </EntryTrigger>
      )}
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
}) as <TItem>(props: ObjectListEntryProps<TItem>) => ReactNode;

type EntryParts = {
  selected: boolean;
  /** Any entry in the list is selected. */
  selecting: boolean;
  /** The name is the rename field. The row is not a button. */
  renaming: boolean;
  /** The trigger is the list's tab stop. */
  tabStop: boolean;
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
  // The scope changes only with the list's features, and the status only
  // with this entry's own state, so upload progress does not draw the row.
  const scope = useObjectListEntryScope<TItem>();
  const { selected, selectable, selecting, renaming, tabStop } =
    useObjectListEntryStatus(entry.key);
  const defaultDescription = useDefaultDescription(entry);
  const folder = entry.kind === "folder";
  const canRename = folder ? scope.renameFolder : scope.renameFile;
  const opens = folder || scope.opensFiles;
  // Folders take dropped files only when the source can place them there.
  const takesDrops = folder && scope.folderUploads;
  const hasMenu = folder
    ? takesDrops || canRename
    : scope.download || scope.share || scope.delete || canRename;

  const resolvedActions =
    actions !== undefined ? (
      actions
    ) : scope.renderActions ? (
      scope.renderActions(entry)
    ) : hasMenu ? (
      <ObjectListItemMenu />
    ) : null;

  return {
    selected,
    selecting,
    renaming,
    tabStop,
    checkbox: selectable ? (
      <ObjectListCheckbox
        checked={selected}
        tabIndex={-1}
        label={t("Select {name}", {
          note: "object list selection",
          variables: { name: entry.name },
        })}
        onCheckedChange={(checked, shiftKey) =>
          scope.toggle(entry.key, { value: checked, range: shiftKey })
        }
      />
    ) : null,
    actions: present(resolvedActions),
    description: present(
      description !== undefined
        ? description
        : scope.renderDescription
          ? scope.renderDescription(entry)
          : defaultDescription,
    ),
    meta: present(meta !== undefined ? meta : scope.renderMeta?.(entry)),
    media: present(media),
    dropTarget: takesDrops ? scope.folderDropTarget(entry.id) : null,
    entryKey: entry.key,
    onClick:
      opens || selectable
        ? (event) => {
            if (selectable) {
              if (event.metaKey || event.ctrlKey) {
                scope.toggle(entry.key);
                return;
              }
              if (event.shiftKey) {
                scope.toggle(entry.key, { range: true, value: true });
                return;
              }
            }
            if (opens) scope.open(entry);
            else scope.toggle(entry.key);
          }
        : null,
  };
}

/**
 * The button that opens or selects an entry. Arrow keys move between these,
 * and only the list's tab stop takes Tab.
 */
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
  const tabIndex = parts.tabStop ? 0 : -1;
  if (!parts.onClick) {
    // Not a button, but Tab, arrow keys, F2 and focus after a rename or
    // delete still reach the row.
    return (
      <div
        tabIndex={tabIndex}
        data-slot="object-list-entry-trigger"
        data-entry-key={parts.entryKey}
        className={cn(focusRing, className)}
      >
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      tabIndex={tabIndex}
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
