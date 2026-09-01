"use client";

import type { ComponentProps, ReactNode } from "react";
import { Trash2Icon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  fileNameFromKey,
  truncateFileName,
} from "@dimah-s3/core";
import type { UseDeleteReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import { Button } from "@/components/ui/button";
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
import { useDeleteUi } from "@/hooks/use-delete-ui";

/** Keep LTR file names and sizes readable inside RTL confirmation copy. */
function isolateLtr(value: string): string {
  return `\u2066${value}\u2069`;
}

/** Props for {@link DeleteButton}. Pass a {@link UseDeleteReturn} as `delete`. */
export type DeleteButtonProps = AttachmentLayoutAliases & {
  delete: UseDeleteReturn;
  /**
   * S3 object key (`api.delete({ route, key })`).
   * Named `objectKey` because React reserves the `key` prop.
   */
  objectKey: string;
  /** Display file name in the confirmation dialog. */
  fileName?: string;
  /** Display file size in the confirmation dialog. */
  fileSize?: number;
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
  delete: del,
  objectKey,
  fileName,
  fileSize,
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
  attachmentSize,
  attachmentOrientation,
}: DeleteButtonProps) {
  const t = useTranslations();
  const displayName = fileName ?? fileNameFromKey(objectKey) ?? objectKey;
  const isThis = del.objectKey === objectKey;
  const isDeletingThis = del.isDeleting && isThis;
  const isDisabled = Boolean(disabled) || del.isDeleting;
  const { statusNode } = useDeleteUi(del, {
    toast: enableToast,
    objectKey,
    displayName,
    attachmentSize,
    attachmentOrientation,
  });

  const buttonContent = children ?? (
    <>
      {isDeletingThis ? (
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

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <AlertDialog
          open={del.isConfirming && isThis}
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
