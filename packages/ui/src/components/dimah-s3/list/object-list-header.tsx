"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isS3ErrorCode } from "@dimah-s3/core";
import {
  useFormatError,
  useFormatNumber,
  type ObjectListFolder,
  type UseObjectListReturn,
  type UseObjectListSelectionReturn,
} from "@dimah-s3/react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import { useTranslations } from "@fuma-translate/react";
import {
  CheckIcon,
  FolderInputIcon,
  FolderPlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteContext } from "@/components/dimah-s3/delete/delete";
import { ObjectListBreadcrumb } from "@/components/dimah-s3/list/object-list-breadcrumb";
import {
  ObjectListHeaderContext,
  useObjectListContext,
  useObjectListInternal,
  useOptionalObjectListHeader,
  type ObjectListHeaderContextValue,
} from "@/components/dimah-s3/list/object-list-context";
import { useObjectListDeleteRequest } from "@/components/dimah-s3/list/object-list-delete";
import { ObjectListCheckbox } from "@/components/dimah-s3/list/object-list-entry";
import { ObjectListSearchBar } from "@/components/dimah-s3/list/object-list-search";

/** Props for {@link ObjectListHeader}. */
export type ObjectListHeaderProps = {
  /** Trailing controls, such as search, sort, view, and upload. */
  children?: ReactNode;
  /** Show the path. Defaults to the list's `breadcrumb`. */
  breadcrumb?: boolean;
  /**
   * Show `ObjectListSearchBar` under the bar while a search is on: where
   * it looks, and how many results it found. @default true
   */
  searchBar?: boolean;
  /** Extra controls on the selection bar. Defaults to the list's `selectionActions`. */
  selectionActions?: ReactNode;
  className?: string;
};

/**
 * Hides a label below this header width, so the control shows its icon
 * alone. Outside a header the label always shows.
 */
export const OBJECT_LIST_HEADER_COMPACT_LABEL =
  "@max-[36rem]/object-list-header:sr-only";

/**
 * Makes a labelled `sm` button square while its label hides, and 32px tall
 * on a touch screen.
 */
export const OBJECT_LIST_HEADER_COMPACT_BUTTON =
  "pointer-coarse:h-8 @max-[36rem]/object-list-header:aspect-square @max-[36rem]/object-list-header:px-0!";

/**
 * Top bar: select-all, the path, a reload spinner, New folder (when the
 * source can create folders), and `children`. While entries are selected it
 * becomes the selection bar.
 *
 * It lays out by its own width (a container query). The path keeps 6rem
 * for itself and shortens to fit; only when the controls do not fit beside
 * that do they move to a second row, aligned to the end. Labels of the
 * built-in controls and `UploadTrigger` hide under 36rem, leaving their
 * icons, and `ObjectListViewToggle` becomes one button under 28rem. An
 * `ObjectListSearch` among `children` shows as a search button, and opens
 * into a field across the whole bar. New folder does the same with its
 * name field: the path and the other controls hide until it closes.
 *
 * While a search is on, `ObjectListSearchBar` sits under the bar: where the
 * search looks (the open folder or everywhere) and how many it found.
 */
export function ObjectListHeader({
  children,
  breadcrumb,
  searchBar = true,
  selectionActions,
  className,
}: ObjectListHeaderProps) {
  const t = useTranslations();
  const { list, selection } = useObjectListContext();
  const internal = useObjectListInternal();
  const selecting = selection?.isSelecting === true;
  const showBreadcrumb = breadcrumb ?? internal.showBreadcrumb;
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [folderExpanded, setFolderExpanded] = useState(false);
  const header = useMemo<ObjectListHeaderContextValue>(
    () => ({ setSearchExpanded, setFolderExpanded }),
    [],
  );
  // A persisted selection spans folders, so the path and controls stay and
  // the selection bar goes under them. Otherwise it takes their place.
  const replaced = selecting && !selection?.persist;
  const creatingFolder = folderExpanded && !replaced;
  // A folder name in progress keeps the bar; search waits.
  const searching = searchExpanded && !creatingFolder && !replaced;

  return (
    <ObjectListHeaderContext.Provider value={header}>
      <div
        data-slot="object-list-header"
        data-selecting={selecting ? "" : undefined}
        data-search-open={searching ? "" : undefined}
        data-folder-open={creatingFolder ? "" : undefined}
        className={cn(
          "group/object-list-header @container/object-list-header shrink-0 border-b border-dimah-s3-border",
          replaced && "bg-dimah-s3-primary/10",
          className,
        )}
      >
        {replaced ? (
          <ObjectListSelectionBar
            actions={selectionActions ?? internal.selectionActions}
          />
        ) : (
          <div
            data-slot="object-list-header-bar"
            className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1.5 py-1.5"
          >
            <div
              data-slot="object-list-header-path"
              className="flex min-w-0 flex-[1_1_6rem] items-center gap-2 group-data-folder-open/object-list-header:hidden group-data-search-open/object-list-header:hidden"
            >
              {selecting ? null : <ObjectListSelectAll />}
              {showBreadcrumb ? (
                <ObjectListBreadcrumb />
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              {list.isRefreshing ? (
                <Spinner
                  className="shrink-0 text-dimah-s3-muted-foreground"
                  aria-label={t("Loading files", { note: "object list" })}
                />
              ) : null}
            </div>
            <div
              data-slot="object-list-header-actions"
              className={cn(
                "ms-auto flex min-w-0 shrink-0 items-center gap-1",
                // While search or new folder is open, that field takes the bar alone.
                "group-data-search-open/object-list-header:ms-0 group-data-search-open/object-list-header:flex-1 group-data-search-open/object-list-header:[&>*:not([data-slot=object-list-search])]:hidden",
                "group-data-folder-open/object-list-header:ms-0 group-data-folder-open/object-list-header:flex-1 group-data-folder-open/object-list-header:[&>*:not([data-slot=object-list-new-folder])]:hidden",
              )}
            >
              <ObjectListNewFolder />
              {children}
            </div>
          </div>
        )}
        {searchBar && list.isSearching ? (
          <ObjectListSearchBar className="border-t border-dimah-s3-border" />
        ) : null}
        {selecting && !replaced ? (
          <ObjectListSelectionBar
            className="border-t border-dimah-s3-border bg-dimah-s3-primary/10"
            actions={selectionActions ?? internal.selectionActions}
          />
        ) : null}
      </div>
    </ObjectListHeaderContext.Provider>
  );
}

/** Props for {@link ObjectListSelectAll}. */
export type ObjectListSelectAllProps = {
  className?: string;
};

/**
 * Checkbox for every loaded entry. With more pages to load, it selects the
 * rows on screen and says so. Hidden without a multiple selection.
 */
export function ObjectListSelectAll({ className }: ObjectListSelectAllProps) {
  const t = useTranslations();
  const { list, selection } = useObjectListContext();
  if (
    !selection ||
    selection.mode !== "multiple" ||
    selection.selectableCount === 0
  ) {
    return null;
  }
  return (
    <ObjectListCheckbox
      className={className}
      checked={selection.allSelected}
      indeterminate={selection.isSelecting && !selection.allSelected}
      label={
        list.hasMore
          ? t("Select this page", { note: "object list selection" })
          : t("Select all", { note: "object list selection" })
      }
      onCheckedChange={(checked) => {
        if (checked) selection.selectAll();
        else selection.clear();
      }}
    />
  );
}

/** Props for {@link ObjectListSelectionBar}. */
export type ObjectListSelectionBarProps = {
  /** Controls beside Delete. Inert while the selected files delete. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Count, `actions`, Move (when the source can move what is selected), bulk
 * Delete (when the list has `delete`), and Clear. Renders nothing while the
 * selection is empty.
 */
export function ObjectListSelectionBar({
  actions,
  className,
}: ObjectListSelectionBarProps) {
  const t = useTranslations();
  const { list, selection, delete: del } = useObjectListContext();
  const count = useSelectionCount(list, selection);
  if (!selection?.isSelecting) return null;

  // Only selected files that are deleting make the bar inert.
  const busy =
    del != null &&
    selection.selected.some(
      (entry) =>
        entry.kind === "file" && del.pendingKeys.includes(objectKeyOf(entry)),
    );

  return (
    <div
      data-slot="object-list-selection-bar"
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-2 px-1.5 py-1.5",
        className,
      )}
    >
      <ObjectListSelectAll />
      {/* The list's live region reads the count out. */}
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-dimah-s3-foreground tabular-nums">
        {count}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {actions ? (
          <div
            inert={busy}
            className={cn("flex items-center gap-1", busy && "opacity-60")}
          >
            {actions}
          </div>
        ) : null}
        <ObjectListBulkMove />
        {del ? <BulkDeleteControl /> : null}
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-8"
          disabled={busy}
          onClick={selection.clear}
        >
          {t("Clear", { note: "object list selection" })}
        </Button>
      </div>
    </div>
  );
}

/**
 * "3 selected", or "3 selected on this page" while select-all left pages
 * unloaded. `null` while nothing is selected. @internal
 */
export function useSelectionCount<TItem>(
  list: UseObjectListReturn<TItem>,
  selection: UseObjectListSelectionReturn<TItem> | null,
): string | null {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  if (!selection?.isSelecting) return null;
  const count = formatNumber(selection.count);
  return selection.allSelected && list.hasMore && !selection.persist
    ? t("{count} selected on this page", {
        note: "object list selection",
        variables: { count },
      })
    : t("{count} selected", {
        note: "object list selection",
        variables: { count },
      });
}

/** Props for {@link ObjectListBulkDelete}. */
export type ObjectListBulkDeleteProps = {
  className?: string;
};

/**
 * Delete button for the selected entries. The list's delete root asks for
 * confirmation. Selected folders go with everything in them when the
 * source can delete folders, and stay otherwise. `ObjectListSelectionBar`
 * already has one; use this in a bar of your own.
 */
export function ObjectListBulkDelete({ className }: ObjectListBulkDeleteProps) {
  const { delete: del, selection } = useObjectListContext();
  if (!del || !selection?.isSelecting) return null;
  return <BulkDeleteControl className={className} />;
}

/**
 * Hands the selected entries to the delete root in one request. Busy while
 * their files delete.
 */
function BulkDeleteControl({ className }: { className?: string }) {
  const t = useTranslations();
  const { selection } = useObjectListContext();
  const { delete: del, isDeleting } = useDeleteContext();
  const requestDelete = useObjectListDeleteRequest();
  const [requested, setRequested] = useState<readonly string[] | null>(null);
  const busy =
    requested != null &&
    (isDeleting || requested.some((key) => del.pendingKeys.includes(key)));
  const label = t("Delete", { note: "button" });

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (!selection || !requestDelete || busy) return;
    const keys = selection.selected.flatMap((entry) =>
      entry.kind === "file" ? [objectKeyOf(entry)] : [],
    );
    const asked = requestDelete(selection.selected, {
      trigger: event.currentTarget,
      // A dismissed dialog deletes nothing, so a later delete of one of
      // these keys from a row menu must not show this button busy.
      onDismissed: () => setRequested(null),
      onDeleted: () => setRequested(null),
    });
    if (asked) setRequested(keys);
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      className={cn(OBJECT_LIST_HEADER_COMPACT_BUTTON, className)}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      focusableWhenDisabled
      onClick={onClick}
    >
      {busy ? (
        <Spinner
          data-icon="inline-start"
          aria-hidden
          aria-label={undefined}
          role={undefined}
        />
      ) : (
        <Trash2Icon data-icon="inline-start" />
      )}
      <span className={OBJECT_LIST_HEADER_COMPACT_LABEL}>{label}</span>
    </Button>
  );
}

/** Props for {@link ObjectListBulkMove}. */
export type ObjectListBulkMoveProps = {
  className?: string;
};

/**
 * Move button for the selected entries: opens the Move dialog for the ones
 * the source can move. Renders nothing when none of them can.
 * `ObjectListSelectionBar` already has one; use this in a bar of your own.
 */
export function ObjectListBulkMove({ className }: ObjectListBulkMoveProps) {
  const t = useTranslations();
  const { list, selection, startMove } = useObjectListContext();
  if (!list.moveEntries || !selection?.isSelecting) return null;
  if (!selection.selected.some((entry) => list.canMove(entry))) return null;
  const label = t("Move", { note: "object list selection" });

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(OBJECT_LIST_HEADER_COMPACT_BUTTON, className)}
      aria-label={label}
      onClick={(event) =>
        startMove(selection.selected, { trigger: event.currentTarget })
      }
    >
      <FolderInputIcon data-icon="inline-start" />
      <span className={OBJECT_LIST_HEADER_COMPACT_LABEL}>{label}</span>
    </Button>
  );
}

/** Props for {@link ObjectListNewFolder}. */
export type ObjectListNewFolderProps = {
  className?: string;
};

/**
 * New folder button for the open folder. Inside `ObjectListHeader` it opens
 * a name field across the whole bar, and the path and the other controls
 * hide until it closes. Enter creates the folder through the source, and
 * Escape or Cancel closes the field. An invalid or taken name shows a
 * message under the field that describes it. Outside a header the field
 * stays inline. Renders nothing when the source has no `createFolder`.
 * `ObjectListHeader` already has one.
 */
export function ObjectListNewFolder({ className }: ObjectListNewFolderProps) {
  const t = useTranslations();
  const { list, startNewFolder } = useObjectListContext();
  const { newFolderOpen, closeNewFolder } = useObjectListInternal();
  const header = useOptionalObjectListHeader();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set when the field closes, so focus goes back to the button.
  const returnFocusRef = useRef(false);
  const setFolderExpanded = header?.setFolderExpanded;

  useEffect(() => {
    if (newFolderOpen || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    buttonRef.current?.focus();
  }, [newFolderOpen]);

  // The header gives the name field the whole bar. Cleared on close, and
  // when the source can no longer create folders, since the field is gone.
  const fieldOpen = newFolderOpen && list.createFolder != null;
  useLayoutEffect(() => {
    if (!setFolderExpanded) return;
    setFolderExpanded(fieldOpen);
    return () => setFolderExpanded(false);
  }, [fieldOpen, setFolderExpanded]);

  if (!list.createFolder) return null;

  if (newFolderOpen) {
    return (
      <NewFolderForm
        createFolder={list.createFolder}
        wide={header != null}
        onClose={() => {
          returnFocusRef.current = true;
          closeNewFolder();
        }}
        className={className}
      />
    );
  }

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="sm"
      data-slot="object-list-new-folder"
      className={cn(OBJECT_LIST_HEADER_COMPACT_BUTTON, className)}
      onClick={startNewFolder}
    >
      <FolderPlusIcon data-icon="inline-start" />
      <span className={OBJECT_LIST_HEADER_COMPACT_LABEL}>
        {t("New folder", { note: "object list" })}
      </span>
    </Button>
  );
}

function NewFolderForm({
  createFolder,
  onClose,
  wide = false,
  className,
}: {
  createFolder: (name: string) => Promise<ObjectListFolder>;
  onClose: () => void;
  /** Fill the header bar. The path and the other controls are hidden. */
  wide?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = t("Folder name", { note: "object list new folder" });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Touch screens get larger buttons, still inside the wide field.
  const buttonSize = wide
    ? "shrink-0 pointer-coarse:size-7"
    : "shrink-0 pointer-coarse:size-9";
  const confirm = (
    <Button
      type="submit"
      variant="ghost"
      size={wide ? "icon-xs" : "icon-sm"}
      className={buttonSize}
      aria-label={t("Create folder", { note: "object list new folder" })}
      aria-busy={pending || undefined}
      disabled={pending}
      focusableWhenDisabled
    >
      {pending ? (
        <Spinner aria-hidden aria-label={undefined} role={undefined} />
      ) : (
        <CheckIcon />
      )}
    </Button>
  );
  const cancel = (
    <Button
      type="button"
      variant="ghost"
      size={wide ? "icon-xs" : "icon-sm"}
      className={buttonSize}
      aria-label={t("Cancel", { note: "object list new folder" })}
      disabled={pending}
      onClick={onClose}
    >
      <XIcon />
    </Button>
  );

  // The same field in either layout.
  const inputProps = {
    ref: inputRef,
    id: inputId,
    value: name,
    maxLength: 255,
    autoComplete: "off",
    placeholder: label,
    readOnly: pending,
    "aria-invalid": error != null || undefined,
    "aria-describedby": error != null ? errorId : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setName(event.target.value);
      setError(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape" || pending) return;
      event.preventDefault();
      onClose();
    },
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("Enter a folder name", { note: "object list new folder" }));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createFolder(trimmed);
    } catch (err) {
      setError(
        isS3ErrorCode(err, "FOLDER_EXISTS")
          ? t("A folder with this name already exists", {
              note: "object list new folder",
            })
          : formatError(err),
      );
      setPending(false);
      inputRef.current?.focus();
      return;
    }
    onClose();
  }

  return (
    <form
      data-slot="object-list-new-folder"
      data-expanded={wide ? "" : undefined}
      aria-busy={pending || undefined}
      className={cn(
        "relative flex min-w-0",
        wide ? "w-full flex-1 flex-col gap-1" : "items-center",
        className,
      )}
      onSubmit={(event) => void onSubmit(event)}
    >
      <div
        className={cn(
          "relative flex min-w-0 items-center",
          wide ? "w-full" : "gap-1",
        )}
      >
        <Label htmlFor={inputId} className="sr-only">
          {label}
        </Label>
        {wide ? (
          <InputGroup className="h-8 border-dimah-s3-border pointer-coarse:h-9">
            <InputGroupAddon>
              <FolderPlusIcon aria-hidden className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput {...inputProps} />
            <InputGroupAddon align="inline-end" className="gap-0.5">
              {confirm}
              {cancel}
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <>
            <Input
              {...inputProps}
              className="h-7 w-36 border-dimah-s3-border px-2 sm:w-44 pointer-coarse:h-9"
            />
            {confirm}
            {cancel}
          </>
        )}
      </div>
      {error != null ? (
        <p
          id={errorId}
          role="alert"
          className={cn(
            "text-xs [overflow-wrap:anywhere] text-dimah-s3-destructive",
            wide
              ? "ps-2.5"
              : "absolute end-0 top-full z-20 mt-1 w-max max-w-64 rounded-md border border-dimah-s3-border bg-dimah-s3-card px-2 py-1 shadow-sm",
          )}
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
