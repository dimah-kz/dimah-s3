"use client";

import type { HTMLAttributes } from "react";
import { useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import {
  downloadDisplayName,
  isDownloadRunning,
  useDownloadContext,
  useFormatDownloadedBytes,
} from "@/components/dimah-s3/download/download";

/** Props for {@link DownloadProgress}. Other props go to the progressbar element. */
export type DownloadProgressProps = {
  /** S3 object key whose download to show. */
  objectKey: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Progress bar for the running `useFetchDownload` call of one key, with the
 * file name and the bytes received. It has `role="progressbar"` and is
 * indeterminate until the total size is known.
 *
 * Renders nothing with `useDownload`, which has no byte progress, and when
 * no call for the key is running.
 */
export function DownloadProgress({
  objectKey,
  className,
  "aria-label": ariaLabel,
  ...props
}: DownloadProgressProps) {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const formatDownloadedBytes = useFormatDownloadedBytes();
  const { download } = useDownloadContext();
  if (download.mode !== "fetch") return null;

  const operation = download.get(objectKey);
  if (!operation || !isDownloadRunning(operation)) return null;

  const { progress } = operation;
  const percent =
    operation.phase === "downloading" && progress.total > 0
      ? Math.round(Math.min(100, Math.max(0, progress.percent)))
      : null;
  const bytes = formatDownloadedBytes(progress);
  const name = downloadDisplayName(operation);

  return (
    <div
      data-slot="download-progress"
      {...props}
      role="progressbar"
      aria-label={
        ariaLabel ??
        t("Progress for {name}", { note: "progress", variables: { name } })
      }
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={
        bytes ??
        (percent == null
          ? t("Starting…", { note: "download progress" })
          : t("{percent}%", {
              note: "progress",
              variables: { percent: formatNumber(percent) },
            }))
      }
      data-phase={operation.phase}
      className={cn("flex w-full min-w-0 flex-col gap-1.5 text-sm", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <bdi className="min-w-0 truncate font-medium text-dimah-s3-foreground">
          {name}
        </bdi>
        {bytes ? (
          <bdi className="ms-auto shrink-0 whitespace-nowrap text-dimah-s3-muted-foreground tabular-nums">
            {bytes}
          </bdi>
        ) : null}
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-dimah-s3-muted">
        <div
          className={cn(
            "absolute inset-y-0 start-0 rounded-full bg-dimah-s3-primary",
            percent == null
              ? "w-full animate-pulse opacity-50"
              : "transition-[width] duration-200",
          )}
          style={percent == null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
