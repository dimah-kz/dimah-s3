"use client";

import { useRef, type ReactNode } from "react";
import type { ObjectListFolder } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { FileTypeGlyph, FolderGlyph } from "@/lib/file-type-icon";

/** Checkbox shared by the header and each selectable row. */
export function SelectCheckbox({
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

export function ObjectListRows<TItem>({
  items,
  folders,
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
  openFolder,
  filesSelectable,
  foldersSelectable,
  fileKeys,
  folderIds,
  selectRow,
}: {
  items: readonly TItem[];
  folders: readonly ObjectListFolder[];
  getKey: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  getDescription?: (item: TItem) => ReactNode;
  getFileName?: (item: TItem) => string;
  getFileType?: (item: TItem) => string | null;
  getPreviewUrl?: (item: TItem) => string | null;
  renderItem?: (item: TItem) => ReactNode;
  renderFolder?: (folder: ObjectListFolder) => ReactNode;
  renderActions?: (item: TItem) => ReactNode;
  renderMeta?: (item: TItem) => ReactNode;
  onOpenItem?: (item: TItem) => void;
  renderFolderActions?: (folder: ObjectListFolder) => ReactNode;
  openFolder?: (folder: ObjectListFolder) => void;
  filesSelectable: boolean;
  foldersSelectable: boolean;
  fileKeys: ReadonlySet<string>;
  folderIds: ReadonlySet<string>;
  selectRow: (
    kind: "file" | "folder",
    id: string,
    checked: boolean,
    shift: boolean,
  ) => void;
}) {
  const t = useTranslations();

  return (
    <div role="list" className="flex min-w-0 flex-col">
      {folders.map((folder) =>
        renderFolder ? (
          <div key={folder.id} role="listitem" data-kind="folder">
            {renderFolder(folder)}
          </div>
        ) : (
          <ObjectListRow
            key={folder.id}
            kind="folder"
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
                    selectRow("folder", folder.id, checked, shift)
                : undefined
            }
            onOpen={openFolder != null ? () => openFolder(folder) : undefined}
          />
        ),
      )}
      {items.map((item) => {
        const key = getKey(item);
        if (renderItem) {
          return (
            <div key={key} role="listitem" data-kind="file">
              {renderItem(item)}
            </div>
          );
        }
        const fileName = getFileName?.(item) ?? getLabel(item);
        const previewUrl = getPreviewUrl?.(item);
        return (
          <ObjectListRow
            key={key}
            kind="file"
            title={getLabel(item)}
            description={getDescription?.(item)}
            media={
              previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  decoding="async"
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
            onOpen={onOpenItem != null ? () => onOpenItem(item) : undefined}
            onSelect={
              filesSelectable
                ? (checked, shift) => selectRow("file", key, checked, shift)
                : undefined
            }
          />
        );
      })}
    </div>
  );
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
 * An inline isolate: the name starts at the row's start edge whatever its
 * script, and the row keeps its own direction. A file keeps its extension
 * visible and puts the ellipsis on the stem, as on file attachments.
 */
function NameLabel({ name, kind }: { name: string; kind: "file" | "folder" }) {
  const { stem, extension } =
    kind === "file" ? splitFileName(name) : { stem: name, extension: "" };
  return (
    <span
      dir="auto"
      title={name}
      className="inline-flex max-w-full min-w-0 align-top"
    >
      <span className="min-w-0 truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}

function ObjectListRow({
  kind,
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
  kind: "file" | "folder";
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
      data-kind={kind}
      data-selected={selected ? "" : undefined}
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
              <NameLabel name={title} kind={kind} />
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
