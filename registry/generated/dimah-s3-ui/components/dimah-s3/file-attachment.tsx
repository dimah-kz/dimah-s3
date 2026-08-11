"use client";

import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  PauseIcon,
  XIcon,
} from "lucide-react";
import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/registry/dimah-s3-ui/components/ui/attachment";
import { CircleProgress } from "@/registry/dimah-s3-ui/components/dimah-s3/circle-progress";
import type { AttachmentState } from "@/registry/dimah-s3-ui/lib/attachment-state";
import { cn } from "@/registry/dimah-s3-ui/lib/utils";

/** @deprecated Use {@link AttachmentState}. */
export type FileAttachmentState = AttachmentState;

export type { AttachmentState };

export type FileAttachmentProps = {
  state: AttachmentState;
  fileName: string;
  fileSize?: number;
  /** Image thumbnail URL — enables `AttachmentMedia variant="image"`. */
  previewUrl?: string | null;
  /** Progress 0–100 when `state` is uploading/idle (pending). */
  percent?: number;
  /** Secondary line; defaults to size, or error text when `state="error"`. */
  description?: ReactNode;
  error?: string | null;
  onCancel?: () => void;
  onPause?: () => void;
  className?: string;
};

export function FileAttachment({
  state,
  fileName,
  fileSize,
  previewUrl,
  percent = 0,
  description,
  error,
  onCancel,
  onPause,
  className,
}: FileAttachmentProps) {
  const t = useTranslations();
  const hasPreview = Boolean(previewUrl);

  const resolvedDescription =
    description ??
    (state === "error"
      ? (error ?? t("Upload failed", { note: "status" }))
      : fileSize != null
        ? formatFileSize(fileSize)
        : null);

  const showActions =
    (state === "uploading" || state === "processing") &&
    (onCancel != null || onPause != null);

  const iconMedia =
    state === "done" ? (
      <CheckCircleIcon />
    ) : state === "error" ? (
      <AlertCircleIcon />
    ) : (
      <CircleProgress
        percent={state === "uploading" ? percent : 0}
        size={14}
        strokeWidth={2}
        className="size-3.5"
      />
    );

  return (
    <Attachment
      state={state}
      size="sm"
      orientation="horizontal"
      className={cn("w-full max-w-full", className)}
    >
      {hasPreview ? (
        <AttachmentMedia variant="image">
          <img src={previewUrl!} alt="" />
          {state === "uploading" ||
          state === "processing" ||
          state === "idle" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <CircleProgress
                percent={state === "uploading" ? percent : 0}
                size={16}
                strokeWidth={2}
                className="size-4"
              />
            </div>
          ) : null}
          {state === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 text-destructive">
              <AlertCircleIcon className="size-4" />
            </div>
          ) : null}
        </AttachmentMedia>
      ) : (
        <AttachmentMedia>{iconMedia}</AttachmentMedia>
      )}
      <AttachmentContent>
        <AttachmentTitle className="max-w-[60ch]">
          {truncateFileName(fileName)}
        </AttachmentTitle>
        {resolvedDescription != null ? (
          <AttachmentDescription
            className={
              state === "error"
                ? "overflow-visible whitespace-normal [overflow-wrap:anywhere]"
                : undefined
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
