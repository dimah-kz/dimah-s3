"use client";

import { truncateFileName } from "@dimah-s3/core";
import { useFormatDimahError, type UseDeleteReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { useDeleteToast } from "@/hooks/use-delete-toast";
import type { AttachmentLayoutAliases } from "@/lib/attachment-layout";

export type UseDeleteUiOptions = AttachmentLayoutAliases & {
  toast?: boolean;
  objectKey: string;
  displayName: string;
};

/**
 * Toasts + success/error status for a `useDelete` return.
 * Status only renders for the matching `objectKey` so a list can share
 * one hook instance. Dismiss calls `delete.reset()`.
 */
export function useDeleteUi(
  del: UseDeleteReturn,
  {
    toast: enableToast = true,
    objectKey,
    displayName,
    attachmentSize,
    attachmentOrientation,
  }: UseDeleteUiOptions,
) {
  useDeleteToast(del, { enabled: enableToast, objectKey, displayName });

  const t = useTranslations();
  const formatError = useFormatDimahError();
  const isThis = del.objectKey === objectKey;

  if (!isThis) {
    return { statusNode: null };
  }

  const statusNode =
    del.phase === "success" ? (
      <StatusAttachment
        state="done"
        title={t('"{name}" deleted', {
          note: "status",
          variables: { name: truncateFileName(displayName) },
        })}
        onDismiss={del.reset}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : del.phase === "error" ? (
      <StatusAttachment
        state="error"
        title={t("Delete failed", { note: "status" })}
        description={del.error ? formatError(del.error) : undefined}
        onDismiss={del.reset}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : null;

  return { statusNode };
}
