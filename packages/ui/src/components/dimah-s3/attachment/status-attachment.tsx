"use client";

import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderCircleIcon,
} from "lucide-react";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { DismissAttachmentAction } from "@/components/dimah-s3/attachment/dismiss-attachment-action";
import {
  ATTACHMENT_ERROR_DESCRIPTION_CLASS,
  ATTACHMENT_TITLE_CLASS,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@/lib/attachment-layout";
import { cn } from "@/lib/utils";

export type StatusAttachmentProps = {
  /** @default "sm" */
  size?: AttachmentSize;
  /** @default "horizontal" */
  orientation?: AttachmentOrientation;
  state: AttachmentState;
  title?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  actions?: ReactNode;
  /** Dismiss control in `AttachmentActions`. Typically the hook `reset()`. */
  onDismiss?: () => void;
  className?: string;
};

/**
 * Minimal Attachment shell for operation feedback (upload/download/delete).
 * Relies on Attachment `data-state` styles for error/done chrome.
 */
export function StatusAttachment({
  state,
  title,
  description,
  media,
  actions,
  onDismiss,
  size = "sm",
  orientation = "horizontal",
  className,
}: StatusAttachmentProps) {
  const defaultMedia =
    state === "error" ? (
      <AlertCircleIcon />
    ) : state === "done" ? (
      <CheckCircleIcon />
    ) : state === "processing" || state === "uploading" ? (
      <LoaderCircleIcon className="animate-spin" data-slot="spinner" />
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
      <AttachmentMedia>{media ?? defaultMedia}</AttachmentMedia>
      <AttachmentContent>
        {title != null ? (
          <AttachmentTitle className={ATTACHMENT_TITLE_CLASS}>
            {title}
          </AttachmentTitle>
        ) : null}
        {description != null ? (
          <AttachmentDescription
            className={
              state === "error" ? ATTACHMENT_ERROR_DESCRIPTION_CLASS : undefined
            }
          >
            {description}
          </AttachmentDescription>
        ) : null}
      </AttachmentContent>
      {actions || onDismiss ? (
        <AttachmentActions>
          {actions}
          {onDismiss ? (
            <DismissAttachmentAction onDismiss={onDismiss} />
          ) : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
