"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { AttachmentAction } from "@/components/ui/attachment";

export type DismissAttachmentActionProps = {
  onDismiss: () => void;
  /** Accessible name. @default "Dismiss" */
  label?: string;
};

/** Icon button that dismisses an attachment, typically through `reset()`. */
export function DismissAttachmentAction({
  onDismiss,
  label,
}: DismissAttachmentActionProps) {
  const t = useTranslations();

  return (
    <AttachmentAction
      type="button"
      aria-label={label ?? t("Dismiss", { note: "attachment action" })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
    >
      <XIcon />
    </AttachmentAction>
  );
}
