"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/registry/dimah-s3-ui/lib/utils";
import type { S3Api } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useDownload } from "@dimah-s3/react";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/registry/dimah-s3-ui/lib/attachment";
import { Button } from "@/registry/dimah-s3-ui/components/ui/button";
import { StatusAttachment } from "@/registry/dimah-s3-ui/components/dimah-s3/attachment/status-attachment";
import { useDownloadToast } from "@/registry/dimah-s3-ui/hooks/use-download-toast";

/** Props for {@link DownloadButton}. */
export type DownloadButtonProps = AttachmentLayoutAliases & {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** S3 object key to download. */
  objectKey: string;
  /** Download filename for Content-Disposition. */
  fileName?: string;
  /** Button label. */
  label?: string;
  /** Custom button content. Replaces default icon + label. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
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
  objectKey,
  fileName,
  label,
  children,
  className,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  variant = "outline",
  size = "default",
  buttonClassName,
  attachmentSize,
  attachmentOrientation,
}: DownloadButtonProps) {
  const t = useTranslations();
  const toastHandlers = useDownloadToast({
    enabled: enableToast,
    objectKey,
    fileName,
  });

  const dl = useDownload({
    api,
    onInitiated: () => {
      toastHandlers.onInitiated();
    },
    onError: (key, error) => {
      toastHandlers.onError(key, error);
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

  const statusNode =
    dl.phase === "error" ? (
      <StatusAttachment
        state="error"
        title={t("Download failed", { note: "status" })}
        description={dl.error ?? undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    ) : null;

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <Button
        variant={variant}
        size={size}
        className={buttonClassName}
        disabled={disabled || isPending}
        onClick={() => dl.download(objectKey, fileName)}
      >
        {buttonContent}
      </Button>
      {resolveStatusSlot(statusSlot, statusNode)}
    </div>
  );
}
