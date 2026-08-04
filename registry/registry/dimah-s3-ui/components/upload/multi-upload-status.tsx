"use client";

import { XIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react";
import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { formatEta } from "@dimah-s3/react";
import type { UploadProgress, MultiUploadFileState } from "@dimah-s3/react";
import { Button } from "@/registry/dimah-s3-ui/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/registry/dimah-s3-ui/components/ui/progress";
import { CircleProgress } from "@/registry/dimah-s3-ui/components/ui/circle-progress";

export function MultiUploadStatus({
  phase,
  files,
  totalProgress,
  error,
  onCancel,
}: {
  phase: string;
  files: MultiUploadFileState[];
  totalProgress: UploadProgress;
  error: string | null;
  onCancel?: () => void;
}) {
  const t = useTranslations();

  if (phase === "idle") return null;

  if (phase === "uploading") {
    const eta =
      totalProgress.speed && totalProgress.total
        ? formatEta(
            totalProgress.total - totalProgress.loaded,
            totalProgress.speed,
          )
        : null;

    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full items-center gap-1.5">
          <Progress value={totalProgress.percent} className="flex-1">
            <ProgressLabel>
              {t("{done}/{total} files", {
                note: "upload progress",
                variables: {
                  done: String(
                    files.filter((f) => f.status === "success").length,
                  ),
                  total: String(files.length),
                },
              })}
              {eta ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {eta}
                </span>
              ) : null}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t("Cancel", { note: "upload control" })}
            onClick={(e) => {
              e.stopPropagation();
              onCancel?.();
            }}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <FileList files={files} />
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex w-full flex-col gap-1">
        <span className="text-xs text-green-600">
          {t("All {count} file(s) uploaded", {
            note: "status",
            variables: { count: String(files.length) },
          })}
        </span>
        <FileList files={files} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex w-full flex-col gap-1">
        <span className="text-xs text-destructive">
          {error ?? t("Upload failed", { note: "status" })}
        </span>
        {files.length > 0 && <FileList files={files} />}
      </div>
    );
  }

  if (phase === "validating") {
    return (
      <span className="text-xs text-muted-foreground">
        {t("Validating…", { note: "upload status" })}
      </span>
    );
  }

  return null;
}

// ─── File List ──────────────────────────────────────────────────────────

function FileList({ files }: { files: MultiUploadFileState[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {files.map((f) => (
        <li key={f.id} className="flex flex-col gap-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            {f.status === "success" && (
              <CheckCircleIcon className="size-3.5 shrink-0 text-green-600" />
            )}
            {f.status === "error" && (
              <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
            )}
            {(f.status === "pending" || f.status === "uploading") && (
              <CircleProgress
                percent={f.status === "uploading" ? f.progress.percent : 0}
                size={14}
                strokeWidth={2}
              />
            )}
            <span className="min-w-0 shrink">
              {truncateFileName(f.fileName)}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatFileSize(f.fileSize)}
            </span>
          </div>
          {f.status === "error" && f.error && (
            <span className="truncate [overflow-wrap:anywhere] ps-5 text-destructive">
              {f.error}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
