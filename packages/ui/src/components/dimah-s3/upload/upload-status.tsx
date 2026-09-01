"use client";

import { formatFileSize } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { formatEta, useFormatDimahError } from "@dimah-s3/react";
import type {
  DimahS3Error,
  UploadFileState,
  UploadPhase,
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
  error: DimahS3Error | null;
  file: UploadFileState | null;
  onCancel?: () => void;
  /** When set (typically with an `uploadStore`), shows a pause control. */
  onPause?: () => void;
  className?: string;
};

/** Presentational row for a single file. Prefer {@link UploadStatus} with `upload`. */
export function UploadFileStatus({
  phase,
  error,
  file,
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
  const progress = file?.progress;

  if (phase === "idle") return null;

  if (phase === "uploading" && file) {
    const eta =
      progress?.speed && progress.total
        ? formatEta(progress.total - progress.loaded, progress.speed)
        : null;

    return (
      <FileAttachment
        state="uploading"
        fileName={file.name}
        fileSize={file.size}
        fileType={file.type}
        previewUrl={file.previewUrl}
        percent={progress?.percent}
        description={eta ? `${formatFileSize(file.size)} · ${eta}` : undefined}
        onCancel={onCancel}
        onPause={onPause}
        {...layout}
      />
    );
  }

  if (phase === "success" && file) {
    return (
      <FileAttachment
        state="done"
        fileName={file.name}
        fileSize={file.size}
        fileType={file.type}
        previewUrl={file.previewUrl}
        {...layout}
      />
    );
  }

  if (phase === "error") {
    if (file) {
      return (
        <FileAttachment
          state="error"
          fileName={file.name}
          fileSize={file.size}
          fileType={file.type}
          previewUrl={file.previewUrl}
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
    if (file) {
      return (
        <FileAttachment
          state="processing"
          fileName={file.name}
          fileSize={file.size}
          fileType={file.type}
          previewUrl={file.previewUrl}
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
        upload={upload}
        attachmentSize={attachmentSize}
        attachmentOrientation={attachmentOrientation}
        className={className}
      />
    );
  }

  return (
    <UploadFileStatus
      phase={upload.phase}
      error={upload.file?.error ?? upload.error}
      file={upload.file}
      onCancel={onCancel}
      onPause={onPause}
      {...layout}
    />
  );
}
