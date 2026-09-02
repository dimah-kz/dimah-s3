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
 * Toasts + success/error status for a `useDownload` return.
 * Status only renders for the matching `objectKey` so a list can share
 * one hook instance. Dismiss calls `download.reset()`.
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
  const layout = {
    size: attachmentSize,
    orientation: attachmentOrientation,
  };

  if (!isThis) {
    return { statusNode: null };
  }

  if (download.phase === "error") {
    return {
      statusNode: (
        <StatusAttachment
          state="error"
          title={t("Download failed", { note: "status" })}
          description={
            download.error ? formatError(download.error) : undefined
          }
          onDismiss={download.reset}
          {...layout}
        />
      ),
    };
  }

  if (download.phase === "success") {
    return {
      statusNode: (
        <StatusAttachment
          state="done"
          title={t("Download complete", { note: "status" })}
          onDismiss={download.reset}
          {...layout}
        />
      ),
    };
  }

  return { statusNode: null };
}
