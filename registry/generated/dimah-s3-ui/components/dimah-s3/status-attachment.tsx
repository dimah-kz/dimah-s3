"use client";

import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { cn } from "@/registry/dimah-s3-ui/lib/utils";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/registry/dimah-s3-ui/components/ui/attachment";

export type StatusAttachmentState =
  "idle" | "uploading" | "processing" | "error" | "done";

export type StatusAttachmentProps = {
  state: StatusAttachmentState;
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
      size="sm"
      orientation="horizontal"
      className={cn("w-full max-w-full", className)}
    >
      <AttachmentMedia>{media ?? defaultMedia}</AttachmentMedia>
      <AttachmentContent>
        {title != null ? (
          <AttachmentTitle className="max-w-[30ch]">{title}</AttachmentTitle>
        ) : null}
        {description != null ? (
          <AttachmentDescription
            className={
              state === "error"
                ? "overflow-visible whitespace-normal [overflow-wrap:anywhere]"
                : undefined
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
