"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "@fuma-translate/react";
import { useFormatEta, useFormatFileSize } from "@dimah-s3/react";
import type { UploadFilePhase, UploadFileState } from "@dimah-s3/react";
import { cn } from "cn";
import {
  FileAttachment,
  type FileAttachmentProps,
} from "@/components/dimah-s3/attachment/file-attachment";
import {
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";
import type { AttachmentState } from "@/lib/attachment-layout";

/** Props for {@link UploadFileItem}. Other props go to `FileAttachment`. */
export type UploadFileItemProps = Omit<
  FileAttachmentProps,
  | "state"
  | "fileName"
  | "fileSize"
  | "contentType"
  | "previewUrl"
  | "percent"
  | "error"
  | "onCancel"
> & {
  /** One entry of `upload.files`. */
  file: UploadFileState;
};

/**
 * Card for one file of the nearest `Upload`: its phase, progress and
 * error, with a cancel action while it is queued or in flight. A cancelled
 * file leaves the queue, so focus moves on to the next action.
 */
export function UploadFileItem({
  file,
  description,
  ...props
}: UploadFileItemProps) {
  const t = useTranslations();
  const formatEta = useFormatEta();
  const formatFileSize = useFormatFileSize();
  const { upload } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const eta = file.phase === "uploading" ? formatEta(file.progress) : null;

  const phaseDescription =
    file.phase === "preparing" || file.phase === "presigning"
      ? t("Preparing…", { note: "upload status" })
      : file.phase === "finalizing"
        ? t("Finishing…", { note: "upload status" })
        : eta
          ? `${formatFileSize(file.fileSize)} · ${eta}`
          : undefined;

  return (
    <FileAttachment
      state={attachmentState(file.phase)}
      fileName={file.fileName}
      fileSize={file.fileSize}
      contentType={file.contentType}
      previewUrl={file.previewUrl}
      percent={file.progress.percent}
      error={file.error}
      description={description ?? phaseDescription}
      onCancel={() => {
        keepFocus();
        upload.cancel(file.id);
      }}
      {...props}
    />
  );
}

/** Props for {@link UploadFileList}. Other props go to the `<ul>`. */
export type UploadFileListProps = Omit<ComponentProps<"ul">, "children"> & {
  /** Renders one file. Defaults to {@link UploadFileItem}. */
  children?: (file: UploadFileState) => ReactNode;
};

/**
 * Every file of the nearest `Upload`, in queue order. Renders nothing
 * while the queue is empty.
 */
export function UploadFileList({
  children,
  className,
  ...props
}: UploadFileListProps) {
  const { upload } = useUploadContext();
  if (upload.files.length === 0) return null;

  return (
    <ul
      data-slot="upload-file-list"
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    >
      {upload.files.map((file) => (
        <li key={file.id} className="min-w-0">
          {children ? children(file) : <UploadFileItem file={file} />}
        </li>
      ))}
    </ul>
  );
}

function attachmentState(phase: UploadFilePhase): AttachmentState {
  switch (phase) {
    case "queued":
      return "idle";
    case "preparing":
    case "presigning":
    case "finalizing":
      return "processing";
    case "uploading":
      return "uploading";
    case "success":
      return "done";
    case "error":
      return "error";
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}
