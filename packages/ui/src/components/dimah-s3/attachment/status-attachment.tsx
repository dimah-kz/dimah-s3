"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { cn } from "cn";
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
  type AttachmentState,
} from "@/lib/attachment-layout";

export type StatusAttachmentProps = Omit<
  ComponentProps<"div">,
  "children" | "title"
> & {
  state: AttachmentState;
  title?: ReactNode;
  description?: ReactNode;
  /** Replaces the state icon. */
  media?: ReactNode;
  /** Extra controls, usually `AttachmentAction`s, placed before dismiss. */
  actions?: ReactNode;
  /** Dismiss control in `AttachmentActions`. Typically the hook `reset()`. */
  onDismiss?: () => void;
};

/**
 * Minimal attachment row for operation feedback (upload, download, delete)
 * that has no single file to show. Set the width with `className`.
 * Error and done chrome come from the Attachment `data-state` styles.
 */
export function StatusAttachment({
  state,
  title,
  description,
  media,
  actions,
  onDismiss,
  className,
  ...props
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
      className={cn("w-full max-w-full", className)}
      {...props}
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
      {actions != null || onDismiss ? (
        <AttachmentActions>
          {actions}
          {onDismiss ? <DismissAttachmentAction onDismiss={onDismiss} /> : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
