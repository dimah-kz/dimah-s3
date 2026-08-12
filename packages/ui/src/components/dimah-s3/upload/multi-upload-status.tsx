"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { formatEta } from "@dimah-s3/react";
import type {
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "@dimah-s3/react";
import { FileAttachment } from "@/components/dimah-s3/attachment/file-attachment";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { AttachmentAction } from "@/components/ui/attachment";
import type { AttachmentLayoutProps, AttachmentState } from "@/lib/attachment";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type MultiUploadStatusProps = AttachmentLayoutProps & {
  phase: MultiUploadPhase;
  files: MultiUploadFileState[];
  totalProgress: UploadProgress;
  error: string | null;
  onCancel?: () => void;
  className?: string;
};

export function MultiUploadStatus({
  phase,
  files,
  totalProgress,
  error,
  onCancel,
  size,
  orientation,
  className,
}: MultiUploadStatusProps) {
  const t = useTranslations();
  const layout = { size, orientation };

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
      <div className={cn("flex w-full flex-col gap-2", className)}>
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
                <span className="font-normal text-dimah-muted-foreground">
                  {" "}
                  · {eta}
                </span>
              ) : null}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
          {onCancel ? (
            <AttachmentAction
              className="shrink-0"
              aria-label={t("Cancel", { note: "upload control" })}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              <XIcon />
            </AttachmentAction>
          ) : null}
        </div>
        <FileList files={files} {...layout} />
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)}>
        <StatusAttachment
          state="done"
          title={t("All {count} file(s) uploaded", {
            note: "status",
            variables: { count: String(files.length) },
          })}
          {...layout}
        />
        <FileList files={files} {...layout} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)}>
        <StatusAttachment
          state="error"
          title={t("Upload failed", { note: "status" })}
          description={error ?? undefined}
          {...layout}
        />
        {files.length > 0 ? <FileList files={files} {...layout} /> : null}
      </div>
    );
  }

  if (phase === "validating") {
    return (
      <StatusAttachment
        state="processing"
        title={t("Validating…", { note: "upload status" })}
        className={className}
        {...layout}
      />
    );
  }

  return null;
}

function fileAttachmentState(
  status: MultiUploadFileState["status"],
): AttachmentState {
  switch (status) {
    case "pending":
      return "idle";
    case "uploading":
      return "uploading";
    case "error":
      return "error";
    case "success":
      return "done";
  }
}

function FileList({
  files,
  size,
  orientation,
}: AttachmentLayoutProps & { files: MultiUploadFileState[] }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {files.map((f) => (
        <FileAttachment
          key={f.id}
          state={fileAttachmentState(f.status)}
          fileName={f.fileName}
          fileSize={f.fileSize}
          fileType={f.fileType}
          previewUrl={f.previewUrl}
          percent={f.progress.percent}
          error={f.error}
          size={size}
          orientation={orientation}
        />
      ))}
    </div>
  );
}
