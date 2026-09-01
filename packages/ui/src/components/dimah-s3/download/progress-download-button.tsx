"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@dimah-s3/core";
import type { UseFetchDownloadReturn } from "@dimah-s3/react";
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
import { useDownloadUi } from "@/components/dimah-s3/download/download-wired";

/** Props for {@link ProgressDownloadButton}. Pass a {@link UseFetchDownloadReturn} as `download`. */
export type ProgressDownloadButtonProps = AttachmentLayoutAliases & {
  download: UseFetchDownloadReturn;
  /**
   * S3 object key (`api.download({ route, key })`).
   * Named `objectKey` because React reserves the `key` prop.
   */
  objectKey: string;
  /** Download filename for Content-Disposition. */
  fileName?: string;
  /** Total file size in bytes (used for progress display). */
  fileSize?: number;
  /** Button label. */
  label?: string;
  /** Custom button content. Replaces default icon + label / progress text. */
  children?: ReactNode;
  className?: string;
  fillClassName?: string;
  disabled?: boolean;
  tooltipText?: string;
  /** Tooltip while downloading (click cancels). @default "Cancel download" */
  cancelTooltipText?: string;
  /** Show toasts during download. @default true */
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

export function ProgressDownloadButton({
  download,
  objectKey,
  fileName,
  fileSize,
  label,
  children,
  className,
  fillClassName,
  disabled,
  tooltipText,
  cancelTooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  variant = "outline",
  size = "default",
  buttonClassName,
  attachmentSize,
  attachmentOrientation,
}: ProgressDownloadButtonProps) {
  const t = useTranslations();
  const { statusNode } = useDownloadUi(download, {
    toast: enableToast,
    status: statusSlot,
    objectKey,
    fileName,
    fileSize,
    attachmentSize,
    attachmentOrientation,
  });

  const handleClick = () => {
    if (download.isPending) {
      download.cancel();
      return;
    }
    download.download(objectKey, fileName);
  };

  const computedPercentFromFileSize =
    fileSize && fileSize > 0
      ? Math.min(100, Math.round((download.progress.loaded / fileSize) * 100))
      : null;

  const fillPercent =
    download.phase === "presigning"
      ? 12
      : download.progress.total > 0
        ? download.progress.percent
        : computedPercentFromFileSize;

  const isIndeterminateFill = download.isDownloading && fillPercent == null;

  const buttonContent = children ?? (
    <>
      {!download.isPending && <DownloadIcon data-icon="inline-start" />}
      {download.isPending
        ? formatFileSize(download.progress.loaded)
        : (label ?? t("Download", { note: "button" }))}
    </>
  );

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={variant}
              size={size}
              disabled={disabled}
              className={cn(
                "relative min-w-24 overflow-hidden",
                buttonClassName,
              )}
              onClick={handleClick}
            />
          }
        >
          {download.isPending && (
            <span
              className={cn(
                "absolute inset-y-0 start-0 bg-dimah-s3-primary/15",
                fillPercent != null
                  ? "transition-[width] duration-200"
                  : "w-full animate-pulse",
                fillClassName,
              )}
              style={
                fillPercent != null ? { width: `${fillPercent}%` } : undefined
              }
              aria-hidden={isIndeterminateFill}
            />
          )}
          <span className="relative z-10 flex w-full items-center justify-center gap-1">
            {buttonContent}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {download.isPending
            ? (cancelTooltipText ?? t("Cancel download", { note: "tooltip" }))
            : (tooltipText ?? t("Download file", { note: "tooltip" }))}
        </TooltipContent>
      </Tooltip>

      {resolveStatusSlot(statusSlot, statusNode)}
    </div>
  );
}
