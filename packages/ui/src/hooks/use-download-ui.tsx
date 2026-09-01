"use client";

import { useFormatDimahError, type UseDownloadReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { useDownloadToast } from "@/hooks/use-download-toast";
import type { AttachmentLayoutAliases } from "@/lib/attachment-layout";

export type UseDownloadUiOptions = AttachmentLayoutAliases & {
  toast?: boolean;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
};

/**
 * Toasts + error status for a `useDownload` return.
 * Status only renders for the matching `objectKey` so a list can share
 * one hook instance.
 */
export function useDownloadUi(
  download: UseDownloadReturn,
  {
    toast: enableToast = true,
    objectKey,
    fileName,
    fileSize,
    attachmentSize,
    attachmentOrientation,
  }: UseDownloadUiOptions,
) {
  useDownloadToast(download, {
    enabled: enableToast,
    objectKey,
    fileName,
    fileSize,
  });

  const t = useTranslations();
  const formatError = useFormatDimahError();
  const isThis = download.objectKey === objectKey;

  const statusNode =
    !isThis || download.phase !== "error" ? null : (
      <StatusAttachment
        state="error"
        title={t("Download failed", { note: "status" })}
        description={download.error ? formatError(download.error) : undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    );

  return { statusNode };
}
