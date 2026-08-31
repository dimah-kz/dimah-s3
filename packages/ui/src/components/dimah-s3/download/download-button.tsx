"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { S3Api } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import {
  useDownload,
  useFormatDimahError,
  type DownloadHooks,
} from "@dimah-s3/react";
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
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { useDownloadToast } from "@/hooks/use-download-toast";

/** Props for {@link DownloadButton}. */
export type DownloadButtonProps = DownloadHooks &
  AttachmentLayoutAliases & {
    /** Named server route (`dimahS3({ routes })`). */
    route: string;
    /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
    api?: S3Api;
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
  api,
  route,
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
  beforeDownload,
  onInitiated,
  onError,
}: DownloadButtonProps) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const toastHandlers = useDownloadToast({
    enabled: enableToast,
    objectKey,
    fileName,
  });

  const dl = useDownload({
    api,
    route,
    beforeDownload,
    onInitiated: (key) => {
      toastHandlers.onInitiated();
      onInitiated?.(key);
    },
    onError: (key, error) => {
      toastHandlers.onError(key, error);
      onError?.(key, error);
    },
  });

  const isPending = dl.phase === "presigning";

  const buttonContent = children ?? (
    <>
      {isPending ? (
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
      disabled={disabled || isPending}
      onClick={() => dl.download(objectKey, fileName)}
    >
      {buttonContent}
    </Button>
  );

  const statusNode =
    dl.phase === "error" ? (
      <StatusAttachment
        state="error"
        title={t("Download failed", { note: "status" })}
        description={dl.error ? formatError(dl.error) : undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : null;

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
