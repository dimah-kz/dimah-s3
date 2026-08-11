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
import {
  ATTACHMENT_ERROR_DESCRIPTION_CLASS,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@/lib/attachment";
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
          <AttachmentTitle className="max-w-[48ch]">{title}</AttachmentTitle>
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
      {actions ? <AttachmentActions>{actions}</AttachmentActions> : null}
    </Attachment>
  );
}
