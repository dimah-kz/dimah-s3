"use client";

import type {
  DimahS3Error,
  UploadFileInfo,
  UploadPhase,
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "@dimah-s3/react";
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";
import { MultiUploadStatus } from "@/components/dimah-s3/upload/multi-upload-status";
import type { AttachmentLayoutProps } from "@/lib/attachment-layout";

export type UploadStatusBlockProps = AttachmentLayoutProps & {
  className?: string;
} & (
    | {
        mode: "single";
        phase: UploadPhase;
        progress: UploadProgress;
        error: DimahS3Error | null;
        fileInfo: UploadFileInfo | null;
        onCancel?: () => void;
        onPause?: () => void;
      }
    | {
        mode: "multi";
        phase: MultiUploadPhase;
        files: MultiUploadFileState[];
        totalProgress: UploadProgress;
        error: DimahS3Error | null;
        onCancel?: () => void;
        onPause?: () => void;
      }
  );

export function UploadStatusBlock(props: UploadStatusBlockProps) {
  const { size, orientation, className } = props;
  const layout = { size, orientation, className };

  if (props.mode === "multi" && props.files.length === 1) {
    const f = props.files[0];
    return (
      <UploadStatus
        phase={props.phase}
        progress={f.progress}
        error={f.error ?? props.error}
        fileInfo={f}
        onCancel={props.onCancel}
        onPause={props.onPause}
        {...layout}
      />
    );
  }

  if (props.mode === "multi") {
    return (
      <MultiUploadStatus
        phase={props.phase}
        files={props.files}
        totalProgress={props.totalProgress}
        error={props.error}
        onCancel={props.onCancel}
        onPause={props.onPause}
        {...layout}
      />
    );
  }

  return (
    <UploadStatus
      phase={props.phase}
      progress={props.progress}
      error={props.error}
      fileInfo={props.fileInfo}
      onCancel={props.onCancel}
      onPause={props.onPause}
      {...layout}
    />
  );
}
