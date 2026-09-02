"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { AttachmentAction } from "@/components/ui/attachment";

export function DismissAttachmentAction({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const t = useTranslations();

  return (
    <AttachmentAction
      type="button"
      aria-label={t("Dismiss", { note: "attachment action" })}
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
