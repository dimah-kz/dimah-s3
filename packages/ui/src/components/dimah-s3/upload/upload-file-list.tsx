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

/** How {@link UploadFileList} lays out its files. */
export type UploadFileListLayout = "list" | "grid";

/** Props for {@link UploadFileList}. Other props go to the `<ul>`. */
export type UploadFileListProps = Omit<ComponentProps<"ul">, "children"> & {
  /**
   * `list` stacks full-width rows. `grid` wraps tiles with the preview
   * above the name, for images. @default "list"
   */
  layout?: UploadFileListLayout;
  /** Renders one file. Defaults to {@link UploadFileItem}. */
  children?: (file: UploadFileState) => ReactNode;
};

/**
 * Every file of the nearest `Upload`, in queue order. Renders nothing
 * while the queue is empty. Inside an `UploadField` (a root with
 * `hideUploaded`), files that uploaded are left out. It sets `data-layout`.
 */
export function UploadFileList({
  layout = "list",
  children,
  className,
  ...props
}: UploadFileListProps) {
  const { upload, hideUploaded } = useUploadContext();
  const files = hideUploaded
    ? upload.files.filter((file) => file.phase !== "success")
    : upload.files;
  if (files.length === 0) return null;

  return (
    <ul
      data-slot="upload-file-list"
      data-layout={layout}
      className={cn(
        layout === "grid"
          ? // Cells stay under the card's 9rem breakpoint, so each one stacks.
            "grid w-full grid-cols-[repeat(auto-fill,minmax(6.5rem,8.5rem))] gap-2"
          : "flex w-full flex-col gap-2",
        className,
      )}
      {...props}
    >
      {files.map((file) => (
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
