"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isS3ErrorCode } from "@dimah-s3/core";
import {
  useFormatDimahError,
  useFormatNumber,
  type ObjectListEntry,
  type ObjectListFolder,
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

/**
 * Top bar: select-all, the path, a reload spinner, New folder (when the
 * source can create folders), and `children`. While entries are selected it
 * becomes the selection bar.
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

  return (
    <div
      data-slot="object-list-header"
      data-selecting={selecting ? "" : undefined}
      className={cn(
        "shrink-0 border-b border-dimah-s3-border",
        selecting && "bg-dimah-s3-primary/10",
        className,
      )}
    >
      {selecting ? (
        <ObjectListSelectionBar
          actions={selectionActions ?? context.selectionActions}
        />
      ) : (
        <div className="flex min-h-11 min-w-0 items-center gap-2 py-1.5 ps-1.5 pe-1">
          <ObjectListSelectAll />
          {showBreadcrumb ? (
            <ObjectListBreadcrumb />
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {list.isRefreshing ? (
              <Spinner
                aria-label={t("Loading files", { note: "object list" })}
              />
            ) : null}
            <NewFolderControl />
            {children}
          </div>
        </div>
      )}
    </div>
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
  const formatNumber = useFormatNumber();
  const { list, selection, delete: del } = useObjectListContext();
  if (!selection?.isSelecting) return null;

  const count = formatNumber(selection.count);
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
        "flex min-h-11 min-w-0 items-center gap-2 py-1.5 ps-1.5 pe-1",
        className,
      )}
    >
      <ObjectListSelectAll />
      <p
        aria-live="polite"
        className="min-w-0 flex-1 truncate text-sm font-medium text-dimah-s3-foreground tabular-nums"
      >
        {selection.allSelected && list.hasMore && !selection.persist
          ? t("{count} selected on this page", {
              note: "object list selection",
              variables: { count },
            })
          : t("{count} selected", {
              note: "object list selection",
              variables: { count },
            })}
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
    } catch {
      report({
        type: "error",
        title: t("Could not delete the selection", {
          note: "object list selection",
        }),
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
    request(plan.targets, { note, trigger });
  }

  return (
    <Button
      variant="destructive"
      size="sm"
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
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

async function planBulkDelete<TItem>(
  selected: readonly ObjectListEntry<TItem>[],
  resolveFolderKeys:
    ((folder: ObjectListFolder) => Promise<readonly string[]>) | undefined,
): Promise<BulkDeletePlan> {
  const targets = new Map<string, DeleteTarget>();
  let skippedFolders = 0;
  for (const entry of selected) {
    if (entry.kind === "file") {
      const objectKey = objectKeyOf(entry);
      targets.set(objectKey, {
        objectKey,
        fileName: entry.file.name,
        fileSize: entry.file.size,
      });
    } else if (resolveFolderKeys) {
      for (const objectKey of await resolveFolderKeys(entry.folder)) {
        if (!targets.has(objectKey)) targets.set(objectKey, { objectKey });
      }
    } else {
      skippedFolders += 1;
    }
  }
  return { targets: [...targets.values()], skippedFolders };
}

/** Props for {@link NewFolderControl}. */
export type NewFolderControlProps = {
  className?: string;
};

/**
 * New folder button for the open folder. It opens a labelled name field:
 * Enter creates the folder through the source, Escape cancels. An invalid
 * or taken name shows a message under the field that describes it.
 * Renders nothing when the source has no `createFolder`.
 * `ObjectListHeader` already has one.
 */
export function NewFolderControl({ className }: NewFolderControlProps) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const [editing, setEditing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set when the field closes, so focus goes back to the button.
  const returnFocusRef = useRef(false);

  useEffect(() => {
    if (editing || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    buttonRef.current?.focus();
  }, [editing]);

  if (!list.createFolder) return null;

  if (editing) {
    return (
      <NewFolderForm
        createFolder={list.createFolder}
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
      className={className}
      onClick={() => setEditing(true)}
    >
      <FolderPlusIcon data-icon="inline-start" />
      <span className="max-sm:sr-only">
        {t("New folder", { note: "object list" })}
      </span>
    </Button>
  );
}

function NewFolderForm({
  createFolder,
  onClose,
  className,
}: {
  createFolder: (name: string) => Promise<ObjectListFolder>;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
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
        isS3ErrorCode(err, "CONFLICT")
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
      aria-busy={pending || undefined}
      className={cn("relative flex items-center gap-1", className)}
      onSubmit={(event) => void onSubmit(event)}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
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
        className="h-7 w-36 min-w-0 rounded-md border border-dimah-s3-border bg-transparent px-2 text-sm text-dimah-s3-foreground outline-none placeholder:text-dimah-s3-muted-foreground focus-visible:border-dimah-s3-ring focus-visible:ring-3 focus-visible:ring-dimah-s3-ring/50 aria-invalid:border-dimah-s3-destructive aria-invalid:ring-dimah-s3-destructive/20 sm:w-44"
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
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label={t("Create folder", { note: "object list new folder" })}
        disabled={pending}
        focusableWhenDisabled
      >
        {pending ? <Spinner /> : <CheckIcon />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("Cancel", { note: "object list new folder" })}
        disabled={pending}
        onClick={onClose}
      >
        <XIcon />
      </Button>
      {error != null ? (
        <p
          id={errorId}
          role="alert"
          className="absolute end-0 top-full z-20 mt-1 w-max max-w-64 rounded-md border border-dimah-s3-border bg-dimah-s3-card px-2 py-1 text-xs [overflow-wrap:anywhere] text-dimah-s3-destructive shadow-sm"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
