"use client";

import {
  useFormatDimahError,
  type UseFetchDownloadReturn,
  type UseNavigateDownloadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { useDownloadToast } from "@/hooks/use-download-toast";
import type {
  AttachmentLayoutAliases,
  StatusSlot,
} from "@/lib/attachment-layout";

type DownloadLayout = AttachmentLayoutAliases & {
  toast?: boolean;
  status?: StatusSlot;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
};

export function useDownloadUi(
  download: UseNavigateDownloadReturn | UseFetchDownloadReturn,
  {
    toast: enableToast = true,
    status: statusSlot = true,
    objectKey,
    fileName,
    fileSize,
    attachmentSize,
    attachmentOrientation,
  }: DownloadLayout,
) {
  useDownloadToast(download, {
    enabled: enableToast,
    objectKey,
    fileName,
    fileSize,
  });

  const t = useTranslations();
  const formatError = useFormatDimahError();

  const statusNode =
    statusSlot === false || download.phase !== "error" ? null : (
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
