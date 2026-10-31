"use client";

import { useRef, useState, type ReactNode } from "react";
import { LoaderIcon, Trash2Icon } from "lucide-react";
import { fileNameFromKey, truncateFileName } from "@dimah-s3/core";
import { useFormatFileSize, useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDeleteContext,
  type DeleteContextValue,
  type DeleteTarget,
} from "@/components/dimah-s3/delete/delete";
import { isolateText } from "@/lib/isolate-text";

/** Props for {@link DeleteConfirmDialog}. Each one replaces the default copy. */
export type DeleteConfirmDialogProps = {
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
};

/**
 * The `Delete` root's confirm dialog. The root renders one by default; pass
 * your own as `<Delete dialog={<DeleteConfirmDialog title="…" />}>`.
 *
 * It is an alert dialog with initial focus on Cancel. It names the file (and
 * its size) for one target, or the count for several, and shows the
 * request's `note` as part of the dialog's description, so it is read out
 * on open. Confirm stays busy until the delete settles. The root moves
 * focus once the dialog closes.
 */
export function DeleteConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
}: DeleteConfirmDialogProps) {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const { pending, confirm, cancel } = useDeleteContext();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  // Keep the copy while the dialog animates out.
  const [shown, setShown] = useState<DeleteContextValue["pending"]>(pending);
  if (pending && pending !== shown) setShown(pending);
  const current = pending ?? shown;
  const targets = current?.targets ?? [];
  const single = targets.length === 1 ? targets[0] : undefined;

  function onConfirm() {
    setBusy(true);
    void confirm().finally(() => {
      setBusy(false);
    });
  }

  return (
    <AlertDialog
      open={pending != null}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} finalFocus={false}>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {title ??
              (single
                ? t("Delete file?", { note: "dialog title" })
                : t("Delete {count} files?", {
                    note: "dialog title",
                    variables: { count: formatNumber(targets.length) },
                  }))}
          </AlertDialogTitle>
          <AlertDialogDescription
            render={<div />}
            className="flex flex-col gap-2 [overflow-wrap:anywhere]"
          >
            <div>
              {description ??
                (single
                  ? t(
                      'Are you sure you want to delete "{name}"? This action cannot be undone.',
                      {
                        note: "dialog description",
                        variables: { name: fileLabel(single, formatFileSize) },
                      },
                    )
                  : t("This action cannot be undone.", {
                      note: "dialog description",
                    }))}
            </div>
            {current?.note != null ? (
              <div data-slot="delete-confirm-note">{current.note}</div>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={busy}>
            {cancelLabel ?? t("Cancel", { note: "dialog button" })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            focusableWhenDisabled
            aria-busy={busy || undefined}
            onClick={onConfirm}
          >
            {busy ? (
              <LoaderIcon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {confirmLabel ?? t("Delete", { note: "dialog confirm" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** `name (size)` as plain text, each part isolated for bidi. */
function fileLabel(
  target: DeleteTarget,
  formatFileSize: (bytes: number) => string,
): string {
  const name = isolateText(
    truncateFileName(
      target.fileName ?? fileNameFromKey(target.objectKey) ?? target.objectKey,
    ),
  );
  return target.fileSize != null
    ? `${name} (${isolateText(formatFileSize(target.fileSize))})`
    : name;
}
