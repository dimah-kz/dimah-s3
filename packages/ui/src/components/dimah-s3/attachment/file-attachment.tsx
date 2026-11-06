"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  AlertCircleIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import type { APIError } from "@dimah-s3/core";
import { useFormatError, useFormatFileSize } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
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
import { DismissAttachmentAction } from "@/components/dimah-s3/attachment/dismiss-attachment-action";
import { FileName } from "@/components/dimah-s3/attachment/file-name";
import { FileTypeGlyph } from "@/components/dimah-s3/attachment/file-type-glyph";
import {
  ATTACHMENT_ERROR_DESCRIPTION_CLASS,
  ATTACHMENT_TITLE_CLASS,
  type AttachmentState,
} from "@/lib/attachment-layout";

export type FileAttachmentProps = Omit<ComponentProps<"div">, "children"> & {
  state: AttachmentState;
  fileName: string;
  fileSize?: number | null;
  /** MIME type. With the file name it picks the type glyph when there is no preview. */
  contentType?: string | null;
  /** Image thumbnail URL. Replaces the type glyph. */
  previewUrl?: string | null;
  /** Ring progress from 0 to 100 while `state` is `idle` or `uploading`. @default 0 */
  percent?: number;
  /** Secondary line. Defaults to the size, or the error text when `state` is `error`. */
  description?: ReactNode;
  error?: string | APIError | null;
  /** Shows a cancel action while the file is queued or in flight: `state` is `idle`, `uploading` or `processing`. */
  onCancel?: () => void;
  /**
   * Shows a retry action when `state` is `error`. It takes the place of
   * cancel, so focus stays on it once the file is back in flight.
   */
  onRetry?: () => void;
  /**
   * Shows the retry action as unavailable, as in a full `UploadField`: it
   * stays focusable but is `aria-disabled`, and `onRetry` does not run.
   * @default false
   */
  retryDisabled?: boolean;
  /** Shows a dismiss action when `state` is `done` or `error`. Typically the hook `reset()`. */
  onDismiss?: () => void;
  /** Extra controls, usually `AttachmentAction`s, placed before cancel and dismiss. */
  actions?: ReactNode;
  /**
   * An `AttachmentTrigger` that makes the whole card one control, for
   * example to open or download the file. Give it an accessible name.
   * Actions stay above it.
   */
  trigger?: ReactNode;
};

/**
 * File card for upload, download and delete feedback.
 *
 * Set the width with `className`. The card is a size container: under a
 * 9rem content width it stacks the media above the text (for example
 * `className="w-32"`), otherwise it lays out as a row.
 */
export function FileAttachment({
  state,
  fileName,
  fileSize,
  contentType,
  previewUrl,
  percent = 0,
  description,
  error,
  onCancel,
  onRetry,
  retryDisabled = false,
  onDismiss,
  actions,
  trigger,
  className,
  ...props
}: FileAttachmentProps) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatFileSize = useFormatFileSize();
  const errorText =
    error == null
      ? null
      : typeof error === "string"
        ? error
        : formatError(error);

  const resolvedDescription =
    description ??
    (state === "error"
      ? (errorText ?? t("Failed", { note: "status" }))
      : fileSize != null
        ? formatFileSize(fileSize)
        : null);

  const showCancel =
    (state === "idle" || state === "uploading" || state === "processing") &&
    onCancel != null;
  const showRetry = state === "error" && onRetry != null;
  const retryUnavailable = showRetry && !showCancel && retryDisabled;
  const showDismiss =
    (state === "done" || state === "error") && onDismiss != null;

  const mediaOverlay =
    state === "idle" || state === "uploading" ? (
      <div className="absolute inset-0 flex items-center justify-center bg-dimah-s3-background/60">
        <CircleProgress
          percent={percent}
          fileName={fileName}
          strokeWidth={2}
          className="size-4 @max-[9rem]/file-attachment:size-6"
        />
      </div>
    ) : state === "processing" ? (
      <div className="absolute inset-0 flex items-center justify-center bg-dimah-s3-background/60">
        <LoaderCircleIcon
          className="size-4 animate-spin @max-[9rem]/file-attachment:size-6"
          data-slot="spinner"
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
      size="sm"
      className={cn(
        "@container/file-attachment w-full max-w-full min-w-0",
        className,
      )}
      {...props}
    >
      <AttachmentMedia
        variant={previewUrl ? "image" : "icon"}
        className="@max-[9rem]/file-attachment:w-full!"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          <FileTypeGlyph fileName={fileName} contentType={contentType} />
        )}
        {mediaOverlay}
      </AttachmentMedia>
      <AttachmentContent className="@max-[9rem]/file-attachment:px-1">
        <AttachmentTitle className={ATTACHMENT_TITLE_CLASS}>
          <FileName name={fileName} />
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
      {trigger}
      {actions != null || showCancel || showRetry || showDismiss ? (
        <AttachmentActions className="@max-[9rem]/file-attachment:absolute @max-[9rem]/file-attachment:end-3 @max-[9rem]/file-attachment:top-3 @max-[9rem]/file-attachment:gap-1">
          {actions}
          {/* One slot, so the same button turns from retry into cancel. */}
          {showCancel || showRetry ? (
            <AttachmentAction
              type="button"
              disabled={retryUnavailable}
              focusableWhenDisabled={retryUnavailable}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-label={
                showCancel
                  ? t("Cancel {name}", {
                      note: "attachment action",
                      variables: { name: fileName },
                    })
                  : t("Retry {name}", {
                      note: "attachment action",
                      variables: { name: fileName },
                    })
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (showCancel ? onCancel : onRetry)?.();
              }}
            >
              {showCancel ? <XIcon /> : <RotateCwIcon />}
            </AttachmentAction>
          ) : null}
          {showDismiss ? (
            <DismissAttachmentAction
              onDismiss={onDismiss}
              label={t("Dismiss {name}", {
                note: "attachment action",
                variables: { name: fileName },
              })}
            />
          ) : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
