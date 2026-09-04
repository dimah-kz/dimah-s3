"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { cn } from "cn";
import type { UseNavigateDownloadReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadUi } from "@/hooks/use-download-ui";

/** Props for {@link DownloadButton}. Pass a {@link UseNavigateDownloadReturn} as `download`. */
export type DownloadButtonProps = AttachmentLayoutAliases & {
  download: UseNavigateDownloadReturn;
  /**
   * S3 object key (`api.download({ route, key })`).
   * Named `objectKey` because React reserves the `key` prop.
   */
  objectKey: string;
  /** Download filename for Content-Disposition. */
  fileName?: string;
  /** Button label. */
  label?: string;
  /** Custom button content. Replaces default icon + label. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  tooltipText?: string;
  /** Show a toast when download starts. @default true */
  toast?: boolean;
  /**
   * Inline status control.
   * - `true` (default): render below the button
   * - `false`: hide status
   * - `(node) => ReactNode`: wrap or relocate the status node
   */
  status?: StatusSlot;
  /** Button variant. @default "outline" */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Button size. @default "default" */
  size?: ComponentProps<typeof Button>["size"];
  /** Extra classes on the trigger button element. */
  buttonClassName?: string;
};

export function DownloadButton({
  download,
  objectKey,
  fileName,
  label,
  children,
  className,
  disabled,
  tooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  variant = "outline",
  size = "default",
  buttonClassName,
  attachmentSize,
  attachmentOrientation,
}: DownloadButtonProps) {
  const t = useTranslations();
  const isThis = download.objectKey === objectKey;
  const isPendingThis = download.isPending && isThis;
  const isDisabled = Boolean(disabled) || isPendingThis;
  const { statusNode } = useDownloadUi(download, {
    toast: enableToast,
    objectKey,
    fileName,
    attachmentSize,
    attachmentOrientation,
  });

  const buttonContent = children ?? (
    <>
      {isPendingThis ? (
        <LoaderIcon className="animate-spin" data-icon="inline-start" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      {label ?? t("Download", { note: "button" })}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      className={buttonClassName}
      disabled={isDisabled}
      onClick={() => download.download(objectKey, fileName)}
    >
      {buttonContent}
    </Button>
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      {tooltipText ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {resolveStatusSlot(statusSlot, statusNode)}
    </div>
  );
}
