"use client";

import type { ComponentProps, ReactNode } from "react";
import { LoaderIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useDeleteContext,
  type DeleteTarget,
} from "@/components/dimah-s3/delete/delete";

/** Props for {@link DeleteTrigger}: `Button` props plus the target. */
export type DeleteTriggerProps = ComponentProps<typeof Button> &
  DeleteTarget & {
    /** Extra content in the confirm dialog. */
    note?: ReactNode;
    /** Tooltip content. No tooltip when omitted. */
    tooltip?: ReactNode;
  };

/**
 * Button that asks the nearest `Delete` root to delete one object. It is
 * disabled, and shows a spinner, while that object is deleting. Children
 * replace the default icon and label. An `onClick` that prevents the default
 * stops the request.
 */
export function DeleteTrigger({
  objectKey,
  fileName,
  fileSize,
  note,
  tooltip,
  variant = "destructive",
  disabled,
  focusableWhenDisabled,
  onClick,
  children,
  ...props
}: DeleteTriggerProps) {
  const t = useTranslations();
  const { delete: del, request } = useDeleteContext();
  const deleting = del.get(objectKey)?.phase === "deleting";

  const button = (
    <Button
      data-slot="delete-trigger"
      aria-busy={deleting || undefined}
      {...props}
      variant={variant}
      disabled={Boolean(disabled) || deleting}
      // Keep focus on the button while its delete runs.
      focusableWhenDisabled={focusableWhenDisabled ?? deleting}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        request(
          { objectKey, fileName, fileSize },
          { note, trigger: event.currentTarget },
        );
      }}
    >
      {children ?? (
        <>
          {deleting ? (
            <LoaderIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
          {t("Delete", { note: "button" })}
        </>
      )}
    </Button>
  );

  if (tooltip == null) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
