"use client";

import { formatFileSize } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { formatEta } from "@dimah-s3/react";
import type {
  UploadFileInfo,
  UploadPhase,
  UploadProgress,
} from "@dimah-s3/react";
import { FileAttachment } from "@/registry/dimah-s3-ui/components/dimah-s3/file-attachment";
import { StatusAttachment } from "@/registry/dimah-s3-ui/components/dimah-s3/status-attachment";

export type UploadStatusProps = {
  phase: UploadPhase;
  progress: UploadProgress;
  error: string | null;
  fileInfo: UploadFileInfo | null;
  onCancel?: () => void;
  /** When set (typically with an `uploadStore`), shows a pause control. */
  onPause?: () => void;
  className?: string;
};

export function UploadStatus({
  phase,
  progress,
  error,
  fileInfo,
  onCancel,
  onPause,
  className,
}: UploadStatusProps) {
  const t = useTranslations();

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
        previewUrl={fileInfo.previewUrl}
        percent={progress.percent}
        description={
          eta ? `${formatFileSize(fileInfo.size)} · ${eta}` : undefined
        }
        onCancel={onCancel}
        onPause={onPause}
        className={className}
      />
    );
  }

  if (phase === "success" && fileInfo) {
    return (
      <FileAttachment
        state="done"
        fileName={fileInfo.name}
        fileSize={fileInfo.size}
        previewUrl={fileInfo.previewUrl}
        className={className}
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
          previewUrl={fileInfo.previewUrl}
          error={error}
          className={className}
        />
      );
    }

    return (
      <StatusAttachment
        state="error"
        title={t("Upload failed", { note: "status" })}
        description={error ?? undefined}
        className={className}
      />
    );
  }

  if (phase === "validating" || phase === "presigning") {
    if (fileInfo) {
      return (
        <FileAttachment
          state="processing"
          fileName={fileInfo.name}
          fileSize={fileInfo.size}
          previewUrl={fileInfo.previewUrl}
          description={t("Preparing…", { note: "upload status" })}
          className={className}
        />
      );
    }

    return (
      <StatusAttachment
        state="processing"
        title={t("Preparing…", { note: "upload status" })}
        className={className}
      />
    );
  }

  return null;
}
