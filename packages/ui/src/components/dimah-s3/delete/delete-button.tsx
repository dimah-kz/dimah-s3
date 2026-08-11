"use client";

import type { ComponentProps, ReactNode } from "react";
import { Trash2Icon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import type { DeleteHooks } from "@dimah-s3/react";
import type { S3Api } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useDelete } from "@dimah-s3/react";
import { resolveStatusSlot, type StatusSlot } from "@/lib/status-slot";
import { Button } from "@/components/ui/button";
import { StatusAttachment } from "@/components/dimah-s3/status-attachment";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeleteToast } from "@/hooks/use-delete-toast";

/** Keep LTR file names and sizes readable inside RTL confirmation copy. */
function isolateLtr(value: string): string {
  return `\u2066${value}\u2069`;
}

/** Props for {@link DeleteButton}. */
export type DeleteButtonProps = DeleteHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** S3 object key to delete. */
  objectKey: string;
  /** Display file name in the confirmation dialog. */
  fileName?: string;
  /** Display file size in the confirmation dialog. */
  fileSize?: number;
  /** Target bucket (overrides server default). */
  bucket?: string;
  /** Button label. */
  label?: string;
  /** Custom button content. Replaces default icon + label. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  tooltipText?: string;
  /** Show a toast during delete. @default true */
  toast?: boolean;
  /**
   * Inline status control.
   * - `true` (default): render below the button
   * - `false`: hide status
   * - `(node) => ReactNode`: wrap or relocate the status node
   */
  status?: StatusSlot;
  confirmTitle?: string;
  confirmDescription?: string;
  /** Button variant. @default "destructive" */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Button size. @default "default" */
  size?: ComponentProps<typeof Button>["size"];
  /** Extra classes on the trigger button element. */
  buttonClassName?: string;
};

export function DeleteButton({
  api,
  objectKey,
  fileName,
  fileSize,
  bucket,
  label,
  children,
  className,
  disabled,
  tooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  confirmTitle,
  confirmDescription,
  variant = "destructive",
  size = "default",
  buttonClassName,
  beforeDelete,
  onDeleteStart,
  onSuccess,
  onError,
}: DeleteButtonProps) {
  const t = useTranslations();
  const displayName = fileName ?? objectKey.split("/").pop() ?? objectKey;
  const toastHandlers = useDeleteToast({
    enabled: enableToast,
    displayName,
  });

  const del = useDelete({
    api,
    bucket,
    beforeDelete,
    onDeleteStart,
    onSuccess: (key) => {
      toastHandlers.onSuccess(key);
      onSuccess?.(key);
    },
    onError: (key, error, phase) => {
      toastHandlers.onError(key, error);
      onError?.(key, error, phase);
    },
  });

  const isDeleting = del.phase === "deleting";
  const isDisabled = disabled || isDeleting;

  const buttonContent = children ?? (
    <>
      {isDeleting ? (
        <LoaderIcon className="animate-spin" data-icon="inline-start" />
      ) : (
        <Trash2Icon data-icon="inline-start" />
      )}
      {label ?? t("Delete", { note: "button" })}
    </>
  );

  const fileLabel =
    fileSize != null
      ? `${truncateFileName(displayName)} (${formatFileSize(fileSize)})`
      : truncateFileName(displayName);

  const description =
    confirmDescription ??
    t(
      'Are you sure you want to delete "{name}"? This action cannot be undone.',
      {
        note: "dialog description",
        variables: { name: isolateLtr(fileLabel) },
      },
    );

  const statusNode =
    del.phase === "success" ? (
      <StatusAttachment
        state="done"
        title={t('"{name}" deleted', {
          note: "status",
          variables: { name: truncateFileName(displayName) },
        })}
      />
    ) : del.phase === "error" ? (
      <StatusAttachment
        state="error"
        title={t("Delete failed", { note: "status" })}
        description={del.error ?? undefined}
      />
    ) : null;

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <AlertDialog
          open={del.phase === "confirming"}
          onOpenChange={(open) => {
            if (!open) del.cancelDelete();
          }}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <AlertDialogTrigger
                  disabled={isDisabled}
                  onClick={() => del.requestDelete(objectKey)}
                  render={
                    <Button
                      variant={variant}
                      size={size}
                      className={buttonClassName}
                      disabled={isDisabled}
                    />
                  }
                />
              }
            >
              {buttonContent}
            </TooltipTrigger>
            <TooltipContent>
              {tooltipText ?? t("Delete file", { note: "tooltip" })}
            </TooltipContent>
          </Tooltip>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {confirmTitle ?? t("Delete file?", { note: "dialog title" })}
              </AlertDialogTitle>
              <AlertDialogDescription
                dir="auto"
                className="[overflow-wrap:anywhere]"
              >
                {description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("Cancel", { note: "dialog button" })}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => del.confirmDelete()}
              >
                {t("Delete", { note: "dialog confirm" })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {resolveStatusSlot(statusSlot, statusNode)}
    </div>
  );
}
