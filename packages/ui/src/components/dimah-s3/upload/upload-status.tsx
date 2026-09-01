"use client";

import { formatFileSize } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { formatEta, useFormatDimahError } from "@dimah-s3/react";
import type {
  DimahS3Error,
  UploadFileInfo,
  UploadPhase,
  UploadProgress,
  UseUploadReturn,
} from "@dimah-s3/react";
import { FileAttachment } from "@/components/dimah-s3/attachment/file-attachment";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { MultiUploadStatus } from "@/components/dimah-s3/upload/multi-upload-status";
import type {
  AttachmentLayoutAliases,
  AttachmentLayoutProps,
} from "@/lib/attachment-layout";

export type UploadFileStatusProps = AttachmentLayoutProps & {
  phase: UploadPhase;
  progress: UploadProgress;
  error: DimahS3Error | null;
  fileInfo: UploadFileInfo | null;
  onCancel?: () => void;
  /** When set (typically with an `uploadStore`), shows a pause control. */
  onPause?: () => void;
  className?: string;
};

/** Presentational row for a single file. Prefer {@link UploadStatus} with `upload`. */
export function UploadFileStatus({
  phase,
  progress,
  error,
  fileInfo,
  onCancel,
  onPause,
  size,
  orientation,
  className,
}: UploadFileStatusProps) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const errorText = error ? formatError(error) : null;
  const layout = { size, orientation, className };

  if (phase === "idle") return null;

  if (phase === "uploading" && fileInfo) {
    const eta =
      progress.speed && progress.total
        ? formatEta(progress.total - progress.loaded, progress.speed)
        : null;

    return (
      <FileAttachment
        state="uploading"
        fileName={fileInfo.name}
        fileSize={fileInfo.size}
        fileType={fileInfo.type}
        previewUrl={fileInfo.previewUrl}
        percent={progress.percent}
        description={
          eta ? `${formatFileSize(fileInfo.size)} · ${eta}` : undefined
        }
        onCancel={onCancel}
        onPause={onPause}
        {...layout}
      />
    );
  }

  if (phase === "success" && fileInfo) {
    return (
      <FileAttachment
        state="done"
        fileName={fileInfo.name}
        fileSize={fileInfo.size}
        fileType={fileInfo.type}
        previewUrl={fileInfo.previewUrl}
        {...layout}
      />
    );
  }

  if (phase === "error") {
    if (fileInfo) {
      return (
        <FileAttachment
          state="error"
          fileName={fileInfo.name}
          fileSize={fileInfo.size}
          fileType={fileInfo.type}
          previewUrl={fileInfo.previewUrl}
          error={errorText}
          {...layout}
        />
      );
    }

    return (
      <StatusAttachment
        state="error"
        title={t("Upload failed", { note: "status" })}
        description={errorText ?? undefined}
        {...layout}
      />
    );
  }

  if (
    phase === "validating" ||
    phase === "presigning" ||
    phase === "finalizing"
  ) {
    if (fileInfo) {
      return (
        <FileAttachment
          state="processing"
          fileName={fileInfo.name}
          fileSize={fileInfo.size}
          fileType={fileInfo.type}
          previewUrl={fileInfo.previewUrl}
          description={
            phase === "finalizing"
              ? t("Finishing…", { note: "upload status" })
              : t("Preparing…", { note: "upload status" })
          }
          {...layout}
        />
      );
    }

    return (
      <StatusAttachment
        state="processing"
        title={
          phase === "finalizing"
            ? t("Finishing…", { note: "upload status" })
            : t("Preparing…", { note: "upload status" })
        }
        {...layout}
      />
    );
  }

  return null;
}

export type UploadStatusProps = AttachmentLayoutAliases & {
  upload: UseUploadReturn;
  className?: string;
};

/** Maps `upload` onto attachment rows (one file or a batch). */
export function UploadStatus({
  upload,
  attachmentSize,
  attachmentOrientation,
  className,
}: UploadStatusProps) {
  const layout = {
    size: attachmentSize,
    orientation: attachmentOrientation,
    className,
  };
  const onCancel = upload.cancel;
  const onPause = upload.resumable ? upload.detach : undefined;

  if (upload.files.length > 1) {
    return (
      <MultiUploadStatus
        phase={upload.phase}
        files={upload.files}
        progress={upload.progress}
        error={upload.error}
        onCancel={onCancel}
        onPause={onPause}
        {...layout}
      />
    );
  }

  return (
    <UploadFileStatus
      phase={upload.phase}
      progress={upload.file?.progress ?? upload.progress}
      error={upload.file?.error ?? upload.error}
      fileInfo={upload.file}
      onCancel={onCancel}
      onPause={onPause}
      {...layout}
    />
  );
}
