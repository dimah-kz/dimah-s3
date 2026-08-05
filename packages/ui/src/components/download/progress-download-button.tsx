"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon, AlertCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@dimah-s3/core";
import type { FetchDownloadHooks } from "@dimah-s3/react";
import type { S3Api } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFetchDownload } from "@dimah-s3/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadToast } from "@/hooks/use-download-toast";

/** Props for {@link ProgressDownloadButton}. */
export type ProgressDownloadButtonProps = FetchDownloadHooks & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** S3 object key to download. */
  objectKey: string;
  /** Download filename for Content-Disposition. */
  fileName?: string;
  /** Total file size in bytes (used for progress display). */
  fileSize?: number;
  /** Target bucket (overrides server default). */
  bucket?: string;
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
  /** Show inline error below the button. @default true */
  showStatus?: boolean;
  /** Button variant. @default "outline" */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Button size. @default "default" */
  size?: ComponentProps<typeof Button>["size"];
  /** Extra classes on the trigger button element. */
  buttonClassName?: string;
};

export function ProgressDownloadButton({
  api,
  objectKey,
  fileName,
  fileSize,
  bucket,
  label,
  children,
  className,
  fillClassName,
  disabled,
  tooltipText,
  cancelTooltipText,
  toast: enableToast = true,
  showStatus = true,
  variant = "outline",
  size = "default",
  buttonClassName,
  beforeDownload,
  onDownloadStart,
  onProgress,
  onSuccess,
  onError,
  onCancel,
}: ProgressDownloadButtonProps) {
  const t = useTranslations();
  const toastHandlers = useDownloadToast({
    enabled: enableToast,
    objectKey,
    fileName,
    fileSize,
  });

  const dl = useFetchDownload({
    api,
    bucket,
    beforeDownload,
    onDownloadStart,
    onProgress,
    onSuccess: (key, actualFileName) => {
      toastHandlers.onSuccess(key, actualFileName);
      onSuccess?.(key, actualFileName);
    },
    onError: (key, error, phase) => {
      toastHandlers.onErrorWithPhase(key, error, phase);
      onError?.(key, error, phase);
    },
    onCancel: (key) => {
      toastHandlers.onCancel(key);
      onCancel?.(key);
    },
  });

  const isDownloading = dl.phase === "downloading" || dl.phase === "presigning";

  const handleClick = () => {
    if (isDownloading) {
      dl.cancel();
      return;
    }
    dl.download(objectKey, fileName);
  };

  const computedPercentFromFileSize =
    fileSize && fileSize > 0
      ? Math.min(100, Math.round((dl.progress.loaded / fileSize) * 100))
      : null;

  const fillPercent =
    dl.phase === "presigning"
      ? 12
      : dl.progress.total > 0
        ? dl.progress.percent
        : computedPercentFromFileSize;

  const isIndeterminateFill =
    isDownloading && fillPercent == null && dl.phase === "downloading";

  const buttonContent = children ?? (
    <>
      {!isDownloading && <DownloadIcon data-icon="inline-start" />}
      {isDownloading
        ? formatFileSize(dl.progress.loaded)
        : (label ?? t("Download", { note: "button" }))}
    </>
  );

  return (
    <div className={cn("inline-flex flex-col items-center gap-1.5", className)}>
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
          {isDownloading && (
            <span
              className={cn(
                "absolute inset-y-0 start-0 bg-primary/15",
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
          {isDownloading
            ? (cancelTooltipText ?? t("Cancel download", { note: "tooltip" }))
            : (tooltipText ?? t("Download file", { note: "tooltip" }))}
        </TooltipContent>
      </Tooltip>

      {showStatus && dl.phase === "error" && (
        <div className="flex min-w-0 items-start gap-1.5 text-xs">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <p className="min-w-0 [overflow-wrap:anywhere] text-destructive">
            {dl.error ?? t("Download failed", { note: "status" })}
          </p>
        </div>
      )}
    </div>
  );
}
