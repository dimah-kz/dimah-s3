"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isS3ErrorCode } from "@dimah-s3/core";
import {
  useFormatError,
  useFormatNumber,
  type ObjectListEntry,
  type ObjectListFolder,
  type UseObjectListReturn,
  type UseObjectListSelectionReturn,
} from "@dimah-s3/react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import { useTranslations } from "@fuma-translate/react";
import { CheckIcon, FolderPlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  useDeleteContext,
  type DeleteTarget,
} from "@/components/dimah-s3/delete/delete";
import { ObjectListBreadcrumb } from "@/components/dimah-s3/list/object-list-breadcrumb";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { ObjectListCheckbox } from "@/components/dimah-s3/list/object-list-entry";
import { useObjectListFeedback } from "@/components/dimah-s3/list/object-list-feedback";

/** Props for {@link ObjectListHeader}. */
export type ObjectListHeaderProps = {
  /** Trailing controls, such as search, sort, view, and upload. */
  children?: ReactNode;
  /** Show the path. Defaults to the list's `breadcrumb`. */
  breadcrumb?: boolean;
  /** Extra controls on the selection bar. Defaults to the list's `selectionActions`. */
  selectionActions?: ReactNode;
  className?: string;
};

/** What {@link ObjectListHeader} shares with the controls inside it. @internal */
type ObjectListHeaderContextValue = {
  /** A search field inside the header is open and takes the whole bar. */
  setSearchExpanded: (expanded: boolean) => void;
  /** The new-folder field is open and takes the whole bar. */
  setFolderExpanded: (expanded: boolean) => void;
};

const ObjectListHeaderContext =
  createContext<ObjectListHeaderContextValue | null>(null);

/** The nearest {@link ObjectListHeader}, or `null` outside one. @internal */
export function useOptionalObjectListHeader() {
  return useContext(ObjectListHeaderContext);
}

/**
 * Hides a label below this header width, so the control shows its icon
 * alone. Outside a header the label always shows.
 */
export const OBJECT_LIST_HEADER_COMPACT_LABEL =
  "@max-[36rem]/object-list-header:sr-only";

/** Makes a labelled `sm` button square while its label hides. */
export const OBJECT_LIST_HEADER_COMPACT_BUTTON =
  "@max-[36rem]/object-list-header:aspect-square @max-[36rem]/object-list-header:px-0!";

/**
 * Top bar: select-all, the path, a reload spinner, New folder (when the
 * source can create folders), and `children`. While entries are selected it
 * becomes the selection bar.
 *
 * It lays out by its own width (a container query). The path keeps room
 * for itself and shortens to fit; when the controls do not fit beside it,
 * they move to a second row, aligned to the end. Labels of the built-in
 * controls and `UploadTrigger` hide under 36rem, leaving their icons. An
 * `ObjectListSearch` among `children` shows as a search button, and opens
 * into a field across the whole bar. New folder does the same with its
 * name field: the path and the other controls hide until it closes.
 */
export function ObjectListHeader({
  children,
  breadcrumb,
  selectionActions,
  className,
}: ObjectListHeaderProps) {
  const t = useTranslations();
  const context = useObjectListContext();
  const { list, selection } = context;
  const selecting = selection?.isSelecting === true;
  const showBreadcrumb = breadcrumb ?? context.showBreadcrumb;
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
            actions={selectionActions ?? context.selectionActions}
          />
        ) : (
          <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1.5 py-1.5">
            <div
              data-slot="object-list-header-path"
              className="flex min-w-0 flex-[1_1_11rem] items-center gap-2 group-data-folder-open/object-list-header:hidden group-data-search-open/object-list-header:hidden"
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
        {selecting && !replaced ? (
          <ObjectListSelectionBar
            className="border-t border-dimah-s3-border bg-dimah-s3-primary/10"
            actions={selectionActions ?? context.selectionActions}
          />
        ) : null}
      </div>
    </ObjectListHeaderContext.Provider>
  );
}

/**
 * Checkbox for every loaded entry. With more pages to load, it selects the
 * rows on screen and says so. Hidden without a multiple selection.
 */
export function ObjectListSelectAll({ className }: { className?: string }) {
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
 * Count, `actions`, bulk Delete (when the list has `delete`), and Clear.
 * Renders nothing while the selection is empty.
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
        {del ? <BulkDeleteControl /> : null}
        <Button
          variant="ghost"
          size="sm"
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

/**
 * Delete button for the selected entries. The list's delete root asks for
 * confirmation. `ObjectListSelectionBar` already has one; use this in a bar
 * of your own.
 */
export function ObjectListBulkDelete() {
  const { delete: del, selection } = useObjectListContext();
  if (!del || !selection?.isSelecting) return null;
  return <BulkDeleteControl />;
}

/** What a bulk delete removes. */
type BulkDeletePlan = {
  targets: readonly DeleteTarget[];
  /** Each selected folder's entry key, with the object keys it holds. */
  folders: readonly { entryKey: string; objectKeys: readonly string[] }[];
  /** Selected folders left out: `resolveFolderKeys` is not set. */
  skippedFolders: number;
};

/**
 * Collects the selected object keys (files, then folders through
 * `resolveFolderKeys`) and hands them to the delete root in one request.
 * Busy while the keys resolve and while they delete.
 */
function BulkDeleteControl() {
  const t = useTranslations();
  const formatError = useFormatError();
  const { selection, resolveFolderKeys } = useObjectListContext();
  const { delete: del, request } = useDeleteContext();
  const report = useObjectListFeedback();
  const [preparing, setPreparing] = useState(false);
  const [requested, setRequested] = useState<readonly string[]>([]);
  const busy =
    preparing || requested.some((key) => del.pendingKeys.includes(key));
  const label = t("Delete", { note: "button" });

  async function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (!selection || busy) return;
    const trigger = event.currentTarget;
    setPreparing(true);
    let plan: BulkDeletePlan;
    try {
      plan = await planBulkDelete(selection.selected, resolveFolderKeys);
    } catch (error) {
      report({
        type: "error",
        title: t("Could not delete the selection", {
          note: "object list selection",
        }),
        description: formatError(error),
      });
      return;
    } finally {
      setPreparing(false);
    }
    const note =
      plan.skippedFolders > 0
        ? t("Selected folders stay in the list.", {
            note: "object list selection",
          })
        : undefined;
    if (plan.targets.length === 0) {
      report({
        type: "info",
        title:
          note ?? t("Nothing to delete", { note: "object list selection" }),
      });
      return;
    }
    setRequested(plan.targets.map((target) => target.objectKey));
    request(plan.targets, {
      note,
      trigger,
      onDeleted: (result) => {
        setRequested([]);
        // A folder whose every object went leaves the selection; the list
        // drops the deleted files itself.
        const deleted = new Set(result.deleted);
        const emptied = plan.folders.filter(
          ({ objectKeys }) =>
            objectKeys.length > 0 &&
            objectKeys.every((key) => deleted.has(key)),
        );
        if (emptied.length > 0) {
          selection.deselect(emptied.map(({ entryKey }) => entryKey));
        }
      },
    });
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      className={OBJECT_LIST_HEADER_COMPACT_BUTTON}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      focusableWhenDisabled
      onClick={(event) => void onClick(event)}
    >
      {busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Trash2Icon data-icon="inline-start" />
      )}
      <span className={OBJECT_LIST_HEADER_COMPACT_LABEL}>{label}</span>
    </Button>
  );
}

async function planBulkDelete<TItem>(
  selected: readonly ObjectListEntry<TItem>[],
  resolveFolderKeys:
    ((folder: ObjectListFolder) => Promise<readonly string[]>) | undefined,
): Promise<BulkDeletePlan> {
  const targets = new Map<string, DeleteTarget>();
  for (const entry of selected) {
    if (entry.kind !== "file") continue;
    const objectKey = objectKeyOf(entry);
    targets.set(objectKey, {
      objectKey,
      fileName: entry.file.name,
      fileSize: entry.file.size,
    });
  }
  const selectedFolders = selected.filter((entry) => entry.kind === "folder");
  if (!resolveFolderKeys) {
    return {
      targets: [...targets.values()],
      folders: [],
      skippedFolders: selectedFolders.length,
    };
  }
  const folders = await Promise.all(
    selectedFolders.map(async (entry) => ({
      entryKey: entry.key,
      objectKeys: await resolveFolderKeys(entry.folder),
    })),
  );
  for (const { objectKeys } of folders) {
    for (const objectKey of objectKeys) {
      if (!targets.has(objectKey)) targets.set(objectKey, { objectKey });
    }
  }
  return { targets: [...targets.values()], folders, skippedFolders: 0 };
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
  const { list } = useObjectListContext();
  const header = useOptionalObjectListHeader();
  const [editing, setEditing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set when the field closes, so focus goes back to the button.
  const returnFocusRef = useRef(false);
  const setFolderExpanded = header?.setFolderExpanded;

  useEffect(() => {
    if (editing || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    buttonRef.current?.focus();
  }, [editing]);

  // The header gives the name field the whole bar. Cleared on close.
  useLayoutEffect(() => {
    if (!setFolderExpanded) return;
    setFolderExpanded(editing);
    return () => setFolderExpanded(false);
  }, [editing, setFolderExpanded]);

  if (!list.createFolder) return null;

  if (editing) {
    return (
      <NewFolderForm
        createFolder={list.createFolder}
        wide={header != null}
        onClose={() => {
          returnFocusRef.current = true;
          setEditing(false);
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
      onClick={() => setEditing(true)}
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

  const confirm = (
    <Button
      type="submit"
      variant="ghost"
      size={wide ? "icon-xs" : "icon-sm"}
      className="shrink-0"
      aria-label={t("Create folder", { note: "object list new folder" })}
      disabled={pending}
      focusableWhenDisabled
    >
      {pending ? <Spinner /> : <CheckIcon />}
    </Button>
  );
  const cancel = (
    <Button
      type="button"
      variant="ghost"
      size={wide ? "icon-xs" : "icon-sm"}
      className="shrink-0"
      aria-label={t("Cancel", { note: "object list new folder" })}
      disabled={pending}
      onClick={onClose}
    >
      <XIcon />
    </Button>
  );

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
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        {wide ? (
          <FolderPlusIcon
            aria-hidden
            className="pointer-events-none absolute start-2.5 size-3.5 text-dimah-s3-muted-foreground"
          />
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          maxLength={255}
          autoComplete="off"
          placeholder={label}
          readOnly={pending}
          aria-invalid={error != null || undefined}
          aria-describedby={error != null ? errorId : undefined}
          className={cn(
            "min-w-0 rounded-md border border-dimah-s3-border bg-transparent text-sm text-dimah-s3-foreground outline-none placeholder:text-dimah-s3-muted-foreground focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 aria-invalid:border-dimah-s3-destructive aria-invalid:ring-dimah-s3-destructive/20",
            // Room at the end for the confirm and cancel buttons, as search does.
            wide ? "h-8 w-full ps-8 pe-16" : "h-7 w-36 px-2 sm:w-44",
          )}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || pending) return;
            event.preventDefault();
            onClose();
          }}
        />
        {wide ? (
          <div className="absolute inset-y-0 end-1.5 flex items-center gap-0.5">
            {confirm}
            {cancel}
          </div>
        ) : (
          <>
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
