"use client";

import type { UseUploadReturn } from "@dimah-s3/react";
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";
import { useUploadToast } from "@/hooks/use-upload-toast";
import { useFileRejectToast } from "@/hooks/use-file-reject-toast";
import type { AttachmentLayoutAliases } from "@/lib/attachment-layout";

export type UseUploadUiOptions = AttachmentLayoutAliases & {
  toast?: boolean;
};

/**
 * Toasts + default {@link UploadStatus} for a `useUpload` return.
 * Placement of `statusNode` is the control's job (`status` / `resolveStatusSlot`).
 */
export function useUploadUi(
  upload: UseUploadReturn,
  {
    toast: enableToast = true,
    attachmentSize,
    attachmentOrientation,
  }: UseUploadUiOptions = {},
) {
  useUploadToast(upload, enableToast);
  useFileRejectToast(upload.fileRejections, enableToast);

  return {
    statusNode: (
      <UploadStatus
        upload={upload}
        attachmentSize={attachmentSize}
        attachmentOrientation={attachmentOrientation}
      />
    ),
  };
}
