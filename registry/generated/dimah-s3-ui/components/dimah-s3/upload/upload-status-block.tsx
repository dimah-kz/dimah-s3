"use client";

import type {
  DimahS3Error,
  UploadFileInfo,
  UploadPhase,
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "@dimah-s3/react";
import { UploadStatus } from "@/registry/dimah-s3-ui/components/dimah-s3/upload/upload-status";
import { MultiUploadStatus } from "@/registry/dimah-s3-ui/components/dimah-s3/upload/multi-upload-status";
import type { AttachmentLayoutProps } from "@/registry/dimah-s3-ui/lib/attachment-layout";

export type UploadStatusBlockProps = AttachmentLayoutProps &
  (
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
  const { size, orientation } = props;
  const layout = { size, orientation };

  if (props.mode === "multi" && props.files.length === 1) {
    const f = props.files[0];
    return (
      <UploadStatus
        phase={props.phase}
        progress={f.progress}
        error={f.error ?? props.error}
        fileInfo={{
          name: f.fileName,
          size: f.fileSize,
          type: f.fileType,
          previewUrl: f.previewUrl,
        }}
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
