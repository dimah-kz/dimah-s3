"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DELETE_BATCH_MAX_KEYS, fileNameFromKey } from "@dimah-s3/core";
import { objectKeyOf, useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { Trash2Icon } from "lucide-react";
import { cn } from "cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ObjectListBreadcrumb } from "@/components/dimah-s3/list/object-list-breadcrumb";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { ObjectListCheckbox } from "@/components/dimah-s3/list/object-list-entry";

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
 * Top bar: select-all, the path, a reload spinner, and `children`.
 * While entries are selected it becomes the selection bar.
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
  /** Controls beside Delete. Inert while a bulk delete runs. */
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
  const { list, selection, remove } = useObjectListContext();
  const bulkDelete = useBulkDelete();
  if (!selection?.isSelecting) return null;

  const count = formatNumber(selection.count);
  const busy = bulkDelete.busy;

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
            className={cn(
              "flex items-center gap-1",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {actions}
          </div>
        ) : null}
        {remove ? <BulkDeleteControl bulkDelete={bulkDelete} /> : null}
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
 * Delete button for the selected entries, with its confirmation.
 * `ObjectListSelectionBar` already has one; use this in a bar of your own.
 */
export function ObjectListBulkDelete() {
  const bulkDelete = useBulkDelete();
  const { remove, selection } = useObjectListContext();
  if (!remove || !selection?.isSelecting) return null;
  return <BulkDeleteControl bulkDelete={bulkDelete} />;
}

type BulkDelete = ReturnType<typeof useBulkDelete>;

type BulkDeletePlan = {
  keys: readonly string[];
  /** Selected folders left out: `resolveFolderKeys` is not set. */
  skippedFolders: number;
};

function BulkDeleteControl({ bulkDelete }: { bulkDelete: BulkDelete }) {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const label = t("Delete", { note: "button" });
  const { phase, plan } = bulkDelete;

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        aria-label={label}
        disabled={bulkDelete.busy}
        onClick={() => void bulkDelete.request()}
      >
        {bulkDelete.busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Trash2Icon data-icon="inline-start" />
        )}
        <span className="max-sm:sr-only">{label}</span>
      </Button>
      <AlertDialog
        open={phase === "confirm" && plan != null}
        onOpenChange={(open) => {
          if (!open) bulkDelete.cancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete {count} files?", {
                note: "object list selection",
                variables: { count: formatNumber(plan?.keys.length ?? 0) },
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("This action cannot be undone.", {
                note: "object list selection",
              })}
              {plan && plan.skippedFolders > 0
                ? ` ${t("Selected folders stay in the list.", { note: "object list selection" })}`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("Cancel", { note: "dialog button" })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void bulkDelete.confirm()}
            >
              {t("Delete", { note: "dialog confirm" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Collect the selected object keys (files, then folders through
 * `resolveFolderKeys`), confirm, and delete in batches of 100.
 */
function useBulkDelete() {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const { selection, remove, resolveFolderKeys, afterDelete } =
    useObjectListContext();
  const [phase, setPhase] = useState<"idle" | "prepare" | "confirm" | "delete">(
    "idle",
  );
  const [plan, setPlan] = useState<BulkDeletePlan | null>(null);
  const mountedRef = useRef(true);
  const deletingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function setPhaseIfMounted(next: typeof phase) {
    if (mountedRef.current) setPhase(next);
  }

  async function prepare(): Promise<BulkDeletePlan> {
    const keys = new Set<string>();
    let skippedFolders = 0;
    for (const entry of selection?.selected ?? []) {
      if (entry.kind === "file") {
        keys.add(objectKeyOf(entry));
      } else if (resolveFolderKeys) {
        for (const key of await resolveFolderKeys(entry.folder)) keys.add(key);
      } else {
        skippedFolders += 1;
      }
    }
    return { keys: [...keys], skippedFolders };
  }

  async function request() {
    if (!remove || phase !== "idle") return;
    setPhase("prepare");
    try {
      const next = await prepare();
      if (!mountedRef.current) return;
      if (next.keys.length === 0) {
        toast.add({
          type: "info",
          title:
            next.skippedFolders > 0
              ? t("Selected folders stay in the list.", {
                  note: "object list selection",
                })
              : t("Nothing to delete", { note: "object list selection" }),
        });
        setPhase("idle");
        return;
      }
      setPlan(next);
      setPhase("confirm");
    } catch {
      toast.add({
        type: "error",
        title: t("Could not delete the selection", {
          note: "object list selection",
        }),
      });
      setPhaseIfMounted("idle");
    }
  }

  async function confirm() {
    if (!plan || !remove || deletingRef.current) return;
    deletingRef.current = true;
    setPhase("delete");
    const deleted: string[] = [];
    const failed: string[] = [];
    try {
      for (
        let index = 0;
        index < plan.keys.length;
        index += DELETE_BATCH_MAX_KEYS
      ) {
        const chunk = plan.keys.slice(index, index + DELETE_BATCH_MAX_KEYS);
        const result = await remove.removeMany(chunk);
        deleted.push(...result.deleted);
        failed.push(...result.failed);
      }
    } finally {
      deletingRef.current = false;
      setPhaseIfMounted("idle");
    }
    if (deleted.length > 0) {
      toast.add({
        type: "success",
        title:
          deleted.length === 1
            ? t("File deleted", { note: "toast" })
            : t("Deleted {count} files", {
                note: "object list selection",
                variables: { count: formatNumber(deleted.length) },
              }),
        description:
          deleted.length === 1 ? (
            <bdi>{fileNameFromKey(deleted[0] ?? "")}</bdi>
          ) : undefined,
      });
    }
    if (failed.length > 0) {
      toast.add({
        type: "error",
        title: t("Could not delete {count} files", {
          note: "object list selection",
          variables: { count: formatNumber(failed.length) },
        }),
      });
    }
    if (deleted.length > 0) selection?.clear();
    afterDelete({ deleted, failed });
  }

  function cancel() {
    if (!deletingRef.current) setPhase("idle");
  }

  return {
    phase,
    plan,
    busy: phase === "prepare" || phase === "delete",
    request,
    confirm,
    cancel,
  };
}
