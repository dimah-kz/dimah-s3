"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownloadIcon, LoaderIcon, XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { fileNameFromKey } from "@dimah-s3/core";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadContext } from "@/components/dimah-s3/download/download";

/** Props for {@link DownloadTrigger}. Other props go to the `Button`. */
export type DownloadTriggerProps = ComponentProps<typeof Button> & {
  /**
   * S3 object key to download.
   * Named `objectKey` because React reserves the `key` prop.
   */
  objectKey: string;
  /** File name the browser saves, fitted to 255 UTF-8 bytes like an upload name. */
  fileName?: string;
  /** Size in bytes. A fetch download uses it as the progress total until the response gives one. */
  fileSize?: number | null;
  /** Tooltip content. No tooltip when omitted. */
  tooltip?: ReactNode;
};

/**
 * Button that downloads one object with the hook of the nearest `Download`.
 *
 * - With `useDownload`, it is disabled and shows a spinner while the URL is
 *   signed.
 * - With `useFetchDownload`, it fills with the progress while the call runs,
 *   and a click cancels the call. Its content becomes "Cancel" and its name
 *   "Cancel download of {name}" for that time. The second click of a
 *   double-click does not cancel the download the first one started. An
 *   icon-size button shows only the cancel icon.
 *
 * `children` replace the default icon and label while no cancel is offered.
 * An icon-size button shows the icon alone, so give it an `aria-label`.
 * `data-phase` carries the phase of the newest call for the key.
 */
export function DownloadTrigger({
  objectKey,
  fileName,
  fileSize,
  tooltip,
  children,
  className,
  disabled,
  focusableWhenDisabled,
  onClick,
  variant = "outline",
  size,
  "aria-label": ariaLabel,
  ...props
}: DownloadTriggerProps) {
  const t = useTranslations();
  const { download } = useDownloadContext();
  const operation = download.get(objectKey);
  const running = download.pendingKeys.includes(objectKey);
  const cancellable = running && download.mode === "fetch";
  const signing = running && download.mode === "navigate";
  const progress =
    cancellable && operation?.phase === "downloading"
      ? operation.progress
      : null;
  const fillPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.max(0, progress.percent))
      : null;

  // An icon button keeps its size: the icon alone, named by `aria-label`.
  const iconOnly = size?.startsWith("icon") ?? false;
  const withLabel = (icon: ReactNode, label: string) =>
    iconOnly ? (
      icon
    ) : (
      <>
        {icon}
        {label}
      </>
    );
  const content = cancellable
    ? withLabel(
        <XIcon data-icon="inline-start" />,
        t("Cancel", { note: "download control" }),
      )
    : (children ??
      withLabel(
        signing ? (
          <LoaderIcon className="animate-spin" data-icon="inline-start" />
        ) : (
          <DownloadIcon data-icon="inline-start" />
        ),
        t("Download", { note: "button" }),
      ));

  const button = (
    <Button
      data-slot="download-trigger"
      data-phase={operation?.phase}
      aria-busy={signing || undefined}
      variant={variant}
      size={size}
      {...props}
      aria-label={
        cancellable
          ? t("Cancel download of {name}", {
              note: "download control",
              variables: {
                name: fileName ?? fileNameFromKey(objectKey) ?? objectKey,
              },
            })
          : ariaLabel
      }
      disabled={Boolean(disabled) || signing}
      // Keep focus on the button while its URL is signed.
      focusableWhenDisabled={focusableWhenDisabled ?? signing}
      className={cn("relative isolate overflow-hidden", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (download.mode === "fetch") {
          if (!cancellable) {
            void download.download(objectKey, { fileName, fileSize });
          } else if (event.detail <= 1) {
            // `detail` counts quick clicks; keyboard activation is 0.
            download.cancel(objectKey);
          }
        } else {
          void download.download(objectKey, { fileName });
        }
      }}
    >
      {cancellable ? (
        <span
          aria-hidden
          data-slot="download-trigger-fill"
          className={cn(
            "absolute inset-y-0 start-0 -z-10 bg-dimah-s3-primary/15",
            fillPercent == null
              ? "w-full animate-pulse"
              : "transition-[width] duration-200",
          )}
          style={fillPercent == null ? undefined : { width: `${fillPercent}%` }}
        />
      ) : null}
      {content}
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
