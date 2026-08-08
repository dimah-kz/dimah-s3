"use client";

import {
  XIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  PauseIcon,
} from "lucide-react";
import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { formatEta } from "@dimah-s3/react";
import type { UploadPhase, UploadProgress } from "@dimah-s3/react";
import { Button } from "@/registry/dimah-s3-ui/components/ui/button";
import { CircleProgress } from "@/registry/dimah-s3-ui/components/ui/circle-progress";

export function UploadStatus({
  phase,
  progress,
  error,
  fileInfo,
  onCancel,
  onPause,
}: {
  phase: UploadPhase;
  progress: UploadProgress;
  error: string | null;
  fileInfo: { name: string; size: number } | null;
  onCancel?: () => void;
  /** When set (typically with an `uploadStore`), shows a pause control. */
  onPause?: () => void;
}) {
  const t = useTranslations();

  if (phase === "idle") return null;

  if (phase === "uploading" && fileInfo) {
    const eta =
      progress.speed && progress.total
        ? formatEta(progress.total - progress.loaded, progress.speed)
        : null;

    return (
      <div className="flex w-full items-center gap-2 text-xs">
        <CircleProgress percent={progress.percent} size={14} strokeWidth={2} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate max-w-[30ch]">
            {truncateFileName(fileInfo.name)}
          </span>
          {eta ? (
            <span className="shrink-0 text-muted-foreground">· {eta}</span>
          ) : null}
        </div>
        <span className="ms-auto shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
          {formatFileSize(fileInfo.size)}
        </span>
        {onPause ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={t("Pause", { note: "upload control" })}
            onClick={(e) => {
              e.stopPropagation();
              onPause();
            }}
          >
            <PauseIcon className="size-3.5" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label={t("Cancel", { note: "upload control" })}
          onClick={(e) => {
            e.stopPropagation();
            onCancel?.();
          }}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (phase === "success" && fileInfo) {
    return (
      <div className="flex w-full items-center gap-1.5 text-xs">
        <CheckCircleIcon className="size-3.5 shrink-0 text-green-600" />
        <span className="min-w-0 flex-1 truncate max-w-[30ch]">
          {truncateFileName(fileInfo.name)}
        </span>
        <span className="ms-auto shrink-0 text-muted-foreground">
          {formatFileSize(fileInfo.size)}
        </span>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-w-0 items-start gap-1.5 text-xs">
        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <p className="min-w-0 [overflow-wrap:anywhere] text-destructive">
          {error ?? t("Upload failed", { note: "status" })}
        </p>
      </div>
    );
  }

  if (phase === "validating" || phase === "presigning") {
    return (
      <span className="text-xs text-muted-foreground">
        {t("Preparing…", { note: "upload status" })}
      </span>
    );
  }

  return null;
}
