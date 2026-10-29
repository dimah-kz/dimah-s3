"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DELETE_BATCH_MAX_KEYS } from "@dimah-s3/core";
import type { UseDeleteReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export type ObjectListSelectionPlan = {
  entries: readonly { key: string; fileName?: string }[];
  skippedFolders: number;
};

export type ObjectListSelectionProps = {
  /** Select-all checkbox, aligned with the row checkboxes. */
  leading?: ReactNode;
  /** Files and folders currently checked. */
  selectedCount: number;
  onClear: () => void;
  /** Object keys to delete, plus folders left out because keys were not provided. */
  prepare: () => Promise<ObjectListSelectionPlan>;
  removeMany?: UseDeleteReturn["removeMany"];
  onDeleted?: (result: { deleted: string[]; failed: string[] }) => void;
};

/**
 * Selection actions for the list header.
 * Deletes run in batches of 100 after confirmation.
 */
export function ObjectListSelection({
  leading,
  selectedCount,
  onClear,
  prepare,
  removeMany,
  onDeleted,
}: ObjectListSelectionProps) {
  const t = useTranslations();
  const [phase, setPhase] = useState<"idle" | "prepare" | "confirm" | "delete">(
    "idle",
  );
  const [planned, setPlanned] = useState<ObjectListSelectionPlan | null>(null);
  const [note, setNote] = useState<{ count: number; text: string } | null>(
    null,
  );
  const visibleNote = note?.count === selectedCount ? note.text : null;
  const deletingRef = useRef(false);
  const mountedRef = useRef(true);
  const busy = phase === "prepare" || phase === "delete";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function showNote(text: string | null) {
    setNote(text === null ? null : { count: selectedCount, text });
  }

  function setPhaseIfMounted(next: typeof phase) {
    if (mountedRef.current) setPhase(next);
  }

  async function requestDelete() {
    if (!removeMany || busy) return;
    showNote(null);
    setPhase("prepare");
    try {
      const next = await prepare();
      if (!mountedRef.current) return;
      if (next.entries.length === 0) {
        showNote(
          next.skippedFolders > 0
            ? t("Selected folders stay in the list.", {
                note: "object list selection",
              })
            : t("Nothing to delete", { note: "object list selection" }),
        );
        setPhase("idle");
        return;
      }
      setPlanned(next);
      setPhase("confirm");
    } catch {
      if (!mountedRef.current) return;
      showNote(
        t("Could not delete the selection", {
          note: "object list selection",
        }),
      );
      setPhase("idle");
    }
  }

  async function confirmDelete() {
    const current = planned;
    if (!current || !removeMany || deletingRef.current) return;
    deletingRef.current = true;
    setPhase("delete");
    const deleted: string[] = [];
    const failed: string[] = [];
    try {
      const keys = current.entries.map((entry) => entry.key);
      for (let index = 0; index < keys.length; index += DELETE_BATCH_MAX_KEYS) {
        const chunk = keys.slice(index, index + DELETE_BATCH_MAX_KEYS);
        const result = await removeMany(chunk);
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
        title: t("Deleted {count} files", {
          note: "object list selection",
          variables: { count: String(deleted.length) },
        }),
      });
    }
    if (failed.length > 0) {
      toast.add({
        type: "error",
        title: t("Could not delete {count} files", {
          note: "object list selection",
          variables: { count: String(failed.length) },
        }),
      });
    }
    onDeleted?.({ deleted, failed });
  }

  if (selectedCount === 0) return null;

  const deleteLabel = t("Delete", { note: "button" });
  const clearLabel = t("Clear", { note: "object list selection" });

  return (
    <>
      <div className="flex min-h-11 min-w-0 items-center gap-2 py-1.5 ps-1.5 pe-1">
        {leading}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate text-sm text-dimah-s3-foreground"
          >
            <span className="font-medium tabular-nums">
              {t("{count} selected", {
                note: "object list selection",
                variables: { count: String(selectedCount) },
              })}
            </span>
            {visibleNote ? (
              <span className="ms-2 font-normal text-dimah-s3-muted-foreground">
                {visibleNote}
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {removeMany ? (
              <Button
                variant="destructive"
                size="sm"
                aria-label={deleteLabel}
                disabled={busy}
                onClick={() => {
                  void requestDelete();
                }}
              >
                {phase === "prepare" || phase === "delete" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Trash2Icon data-icon="inline-start" />
                )}
                <span className="max-sm:sr-only">{deleteLabel}</span>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
              {clearLabel}
            </Button>
          </div>
        </div>
      </div>
      <AlertDialog
        open={phase === "confirm" && planned != null}
        onOpenChange={(open) => {
          if (!open && !deletingRef.current) setPhase("idle");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete {count} files?", {
                note: "object list selection",
                variables: { count: String(planned?.entries.length ?? 0) },
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("This action cannot be undone.", {
                note: "object list selection",
              })}
              {planned && planned.skippedFolders > 0
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
              onClick={() => {
                void confirmDelete();
              }}
            >
              {t("Delete", { note: "dialog confirm" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
