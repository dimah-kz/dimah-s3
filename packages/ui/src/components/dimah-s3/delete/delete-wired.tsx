"use client";

import { truncateFileName } from "@dimah-s3/core";
import { useFormatDimahError, type UseDeleteReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { useDeleteToast } from "@/hooks/use-delete-toast";
import type {
  AttachmentLayoutAliases,
  StatusSlot,
} from "@/lib/attachment-layout";

type DeleteLayout = AttachmentLayoutAliases & {
  toast?: boolean;
  status?: StatusSlot;
  displayName: string;
};

export function useDeleteUi(
  del: UseDeleteReturn,
  {
    toast: enableToast = true,
    status: statusSlot = true,
    displayName,
    attachmentSize,
    attachmentOrientation,
  }: DeleteLayout,
) {
  useDeleteToast(del, { enabled: enableToast, displayName });

  const t = useTranslations();
  const formatError = useFormatDimahError();

  const statusNode =
    statusSlot === false ? null : del.phase === "success" ? (
      <StatusAttachment
        state="done"
        title={t('"{name}" deleted', {
          note: "status",
          variables: { name: truncateFileName(displayName) },
        })}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : del.phase === "error" ? (
      <StatusAttachment
        state="error"
        title={t("Delete failed", { note: "status" })}
        description={del.error ? formatError(del.error) : undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : null;

  return { statusNode };
}
