"use client";

import { PauseIcon, XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { formatEta, useFormatDimahError } from "@dimah-s3/react";
import type { UploadFileState, UseUploadReturn } from "@dimah-s3/react";
import { FileAttachment } from "@/components/dimah-s3/attachment/file-attachment";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { AttachmentAction } from "@/components/ui/attachment";
import type {
  AttachmentLayoutAliases,
  AttachmentLayoutProps,
  AttachmentState,
} from "@/lib/attachment-layout";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type MultiUploadStatusProps = AttachmentLayoutAliases & {
  upload: UseUploadReturn;
  className?: string;
};

export function MultiUploadStatus({
  upload,
  attachmentSize,
  attachmentOrientation,
  className,
}: MultiUploadStatusProps) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const { phase, files, progress, error } = upload;
  const onCancel = upload.cancel;
  const onPause = upload.resumable ? upload.detach : undefined;
  const errorText = error ? formatError(error) : null;
  const layout = {
    size: attachmentSize,
    orientation: attachmentOrientation,
  };

  if (phase === "idle") return null;

  if (phase === "uploading") {
    const eta =
      progress.speed && progress.total
        ? formatEta(progress.total - progress.loaded, progress.speed)
        : null;

    return (
      <div className={cn("flex w-full flex-col gap-2", className)}>
        <div className="flex w-full items-center gap-1.5">
          <Progress value={progress.percent} className="flex-1">
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
                <span className="font-normal text-dimah-s3-muted-foreground">
                  {" "}
                  · {eta}
                </span>
              ) : null}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
          {onPause ? (
            <AttachmentAction
              className="shrink-0"
              aria-label={t("Pause", { note: "upload control" })}
              onClick={(e) => {
                e.stopPropagation();
                onPause();
              }}
            >
              <PauseIcon />
            </AttachmentAction>
          ) : null}
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
          onDismiss={upload.reset}
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
          description={errorText ?? undefined}
          onDismiss={upload.reset}
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
  status: UploadFileState["status"],
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
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function FileList({
  files,
  size,
  orientation,
}: AttachmentLayoutProps & { files: UploadFileState[] }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {files.map((f) => (
        <FileAttachment
          key={f.id}
          state={fileAttachmentState(f.status)}
          fileName={f.name}
          fileSize={f.size}
          fileType={f.type}
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
