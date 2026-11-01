"use client";

import type { ComponentProps, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { UploadCallOptions } from "@dimah-s3/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useUploadCall,
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";

/** Props for {@link UploadTrigger}. Every `Button` prop is forwarded, `render` too. */
export type UploadTriggerProps = ComponentProps<typeof Button> & {
  /** Call options for the picked files. */
  call?: UploadCallOptions;
  /** Shown in a tooltip on hover and focus. */
  tooltip?: ReactNode;
};

/**
 * Button that opens the file picker of the nearest `Upload`. Render it
 * inside `<Upload>`.
 *
 * The default content is an icon and "Upload file" (or "Upload files" when
 * the hook takes more than one). An `onClick` that prevents the default
 * keeps the picker closed. It is disabled while the hook is
 * (`upload.disabled`); a `disabled` prop replaces that default, but the
 * picker stays closed while the hook is disabled. While the root is full, as
 * in a full `UploadField`, it stays focusable but is `aria-disabled`.
 */
export function UploadTrigger({
  call,
  tooltip,
  disabled,
  focusableWhenDisabled,
  className,
  children,
  onClick,
  ...props
}: UploadTriggerProps) {
  const t = useTranslations();
  const { upload, isFull } = useUploadContext();
  const uploadCall = useUploadCall(upload, call);
  const { intakeProps } = useUploadFocus();

  const button = (
    <Button
      data-slot="upload-trigger"
      {...intakeProps}
      {...props}
      disabled={(disabled ?? upload.disabled) || isFull}
      // A full field keeps the trigger reachable, announced as unavailable.
      focusableWhenDisabled={focusableWhenDisabled ?? isFull}
      className={cn(
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) upload.open(uploadCall);
      }}
    >
      {children ?? (
        <>
          <CloudUpload data-icon="inline-start" aria-hidden />
          {upload.policy.maxFiles > 1
            ? t("Upload files", { note: "button" })
            : t("Upload file", { note: "button" })}
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
