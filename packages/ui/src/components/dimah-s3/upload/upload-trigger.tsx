"use client";

import type { ComponentProps, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { UploadCallOptions } from "@dimah-s3/react";
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
 * keeps the picker closed.
 */
export function UploadTrigger({
  call,
  tooltip,
  children,
  onClick,
  ...props
}: UploadTriggerProps) {
  const t = useTranslations();
  const { upload } = useUploadContext();
  const uploadCall = useUploadCall(upload, call);
  const { intakeProps } = useUploadFocus();

  const button = (
    <Button
      {...intakeProps}
      {...props}
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
