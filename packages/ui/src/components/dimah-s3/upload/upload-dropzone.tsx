"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@fuma-translate/react";
import type { UseUploadReturn } from "@dimah-s3/react";
import {
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import {
  DropzoneChrome,
  DropzoneFrame,
  dropzoneHints,
  resolveDefaultStatus,
  useUploadUi,
} from "@/components/dimah-s3/upload/upload-wired";

/** Props for {@link UploadDropzone}. Pass a {@link UseUploadReturn} as `upload`. */
export type UploadDropzoneProps = AttachmentLayoutAliases & {
  upload: UseUploadReturn;
  className?: string;
  /** Dropzone label. */
  label?: string;
  /**
   * Custom dropzone chrome (icon + hints). Replaces the built-in idle content
   * only — status still renders via the `status` prop.
   */
  children?: ReactNode;
  disabled?: boolean;
  /** Show toasts during upload. @default true */
  toast?: boolean;
  /**
   * Inline status control.
   * - `true` (default): render inside the dropzone
   * - `false`: hide status
   * - `(node) => ReactNode`: wrap or relocate the status node
   */
  status?: StatusSlot;
};

export function UploadDropzone({
  upload,
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  attachmentSize,
  attachmentOrientation,
}: UploadDropzoneProps) {
  const t = useTranslations();
  const isDisabled = Boolean(disabled) || upload.isPending;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(upload.policy, t);
  const { statusNode } = useUploadUi(upload, {
    toast: enableToast,
    status: statusSlot,
    attachmentSize,
    attachmentOrientation,
  });
  const status = resolveDefaultStatus(statusSlot, statusNode, (node) => (
    <div
      className={
        hasCustomChrome ? "w-full px-3 pb-3 text-start" : "w-full text-start"
      }
    >
      {node}
    </div>
  ));

  return (
    <DropzoneFrame
      getRootProps={upload.getRootProps}
      getInputProps={upload.getInputProps}
      isDisabled={isDisabled}
      isDragReject={upload.isDragReject}
      isDragAccept={upload.isDragAccept}
      isDragActive={upload.isDragActive}
      className={className}
      hasCustomChrome={hasCustomChrome}
      ariaLabel={dropzoneLabel}
      chrome={
        <DropzoneChrome
          label={dropzoneLabel}
          limitsLine={limitsLine}
          acceptLine={acceptLine}
          isDisabled={isDisabled}
        >
          {children}
        </DropzoneChrome>
      }
      status={status}
    />
  );
}
