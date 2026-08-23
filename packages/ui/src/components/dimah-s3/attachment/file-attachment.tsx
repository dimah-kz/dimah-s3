"use client";

import type { ReactNode } from "react";
import { AlertCircleIcon, PauseIcon, XIcon } from "lucide-react";
import {
  formatFileSize,
  truncateFileName,
  type DimahS3Error,
} from "@dimah-s3/core";
import { useFormatDimahError } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { CircleProgress } from "@/components/dimah-s3/attachment/circle-progress";
import {
  ATTACHMENT_ERROR_DESCRIPTION_CLASS,
  ATTACHMENT_TITLE_CLASS,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@/lib/attachment-layout";
import { FileTypeGlyph } from "@/lib/file-type-icon";
import { cn } from "@/lib/utils";

const PROGRESS_BY_SIZE = {
  default: { size: 20, strokeWidth: 2.5, className: "size-5" },
  sm: { size: 16, strokeWidth: 2, className: "size-4" },
  xs: { size: 14, strokeWidth: 1.5, className: "size-3.5" },
} as const satisfies Record<
  AttachmentSize,
  { size: number; strokeWidth: number; className: string }
>;

export type FileAttachmentProps = {
  /** @default "sm" */
  size?: AttachmentSize;
  /** @default "horizontal" */
  orientation?: AttachmentOrientation;
  state: AttachmentState;
  fileName: string;
  fileSize?: number;
  /** MIME type — used with the filename to pick a type icon when no preview. */
  fileType?: string | null;
  /** Image thumbnail URL — enables `AttachmentMedia variant="image"`. */
  previewUrl?: string | null;
  /** Progress 0–100 when `state` is uploading/idle (pending). */
  percent?: number;
  /** Secondary line; defaults to size, or error text when `state="error"`. */
  description?: ReactNode;
  error?: string | DimahS3Error | null;
  onCancel?: () => void;
  onPause?: () => void;
  className?: string;
};

export function FileAttachment({
  state,
  fileName,
  fileSize,
  fileType,
  previewUrl,
  percent = 0,
  description,
  error,
  onCancel,
  onPause,
  size = "sm",
  orientation = "horizontal",
  className,
}: FileAttachmentProps) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const errorText =
    error == null
      ? null
      : typeof error === "string"
        ? error
        : formatError(error);
  const hasPreview = Boolean(previewUrl);
  const progress = PROGRESS_BY_SIZE[size];

  const resolvedDescription =
    description ??
    (state === "error"
      ? (errorText ?? t("Upload failed", { note: "status" }))
      : fileSize != null
        ? formatFileSize(fileSize)
        : null);

  const showActions =
    (state === "uploading" || state === "processing") &&
    (onCancel != null || onPause != null);

  const showProgressOverlay =
    state === "uploading" || state === "processing" || state === "idle";

  const mediaOverlay = showProgressOverlay ? (
    <div className="absolute inset-0 flex items-center justify-center bg-dimah-s3-background/60">
      <CircleProgress
        percent={state === "uploading" ? percent : 0}
        size={progress.size}
        strokeWidth={progress.strokeWidth}
        className={progress.className}
        label={
          state === "uploading"
            ? t("{percent}%", {
                note: "progress",
                variables: { percent: String(Math.round(percent)) },
              })
            : undefined
        }
      />
    </div>
  ) : state === "error" ? (
    <div className="absolute inset-0 flex items-center justify-center bg-dimah-s3-destructive/20 text-dimah-s3-destructive">
      <AlertCircleIcon />
    </div>
  ) : null;

  return (
    <Attachment
      state={state}
      size={size}
      orientation={orientation}
      className={cn(
        orientation === "horizontal" && "w-full max-w-full",
        className,
      )}
    >
      {hasPreview ? (
        <AttachmentMedia variant="image">
          <img src={previewUrl!} alt="" />
          {mediaOverlay}
        </AttachmentMedia>
      ) : (
        <AttachmentMedia>
          <FileTypeGlyph fileName={fileName} fileType={fileType} />
          {mediaOverlay}
        </AttachmentMedia>
      )}
      <AttachmentContent>
        <AttachmentTitle className={ATTACHMENT_TITLE_CLASS}>
          {truncateFileName(fileName)}
        </AttachmentTitle>
        {resolvedDescription != null ? (
          <AttachmentDescription
            className={
              state === "error" ? ATTACHMENT_ERROR_DESCRIPTION_CLASS : undefined
            }
          >
            {resolvedDescription}
          </AttachmentDescription>
        ) : null}
      </AttachmentContent>
      {showActions ? (
        <AttachmentActions>
          {onPause ? (
            <AttachmentAction
              aria-label={t("Pause", { note: "upload control" })}
              onClick={(e) => {
                e.stopPropagation();
                onPause();
              }}
            >
              <PauseIcon />
            </AttachmentAction>
          ) : null}
          {onCancel ? (
            <AttachmentAction
              aria-label={t("Cancel", { note: "upload control" })}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              <XIcon />
            </AttachmentAction>
          ) : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
