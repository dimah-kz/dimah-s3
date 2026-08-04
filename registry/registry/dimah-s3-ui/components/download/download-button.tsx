"use client";

import type { ComponentProps, ReactNode } from "react";
import { AlertCircleIcon, DownloadIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/registry/dimah-s3-ui/lib/utils";
import type { S3Api } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useDownload } from "@dimah-s3/react";
import { Button } from "@/registry/dimah-s3-ui/components/ui/button";
import { useDownloadToast } from "@/registry/dimah-s3-ui/hooks/use-download-toast";

/** Props for {@link DownloadButton}. */
export type DownloadButtonProps = {
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
  /** Show a sonner toast when download starts. @default true */
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

export function DownloadButton({
  api,
  objectKey,
  fileName,
  label,
  children,
  className,
  disabled,
  toast: enableToast = true,
  showStatus = true,
  variant = "outline",
  size = "default",
  buttonClassName,
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

  return (
    <div className={cn("inline-flex flex-col gap-1.5", className)}>
      <Button
        variant={variant}
        size={size}
        className={buttonClassName}
        disabled={disabled || isPending}
        onClick={() => dl.download(objectKey, fileName)}
      >
        {buttonContent}
      </Button>

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
