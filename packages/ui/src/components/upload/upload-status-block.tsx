"use client";

import type {
  UploadPhase,
  UploadProgress,
  MultiUploadFileState,
  MultiUploadPhase,
} from "@dimah-s3/react";
import { UploadStatus } from "@/components/upload/upload-status";
import { MultiUploadStatus } from "@/components/upload/multi-upload-status";

export type UploadStatusBlockProps =
  | {
      mode: "single";
      phase: UploadPhase;
      progress: UploadProgress;
      error: string | null;
      fileInfo: { name: string; size: number } | null;
      onCancel?: () => void;
      onPause?: () => void;
    }
  | {
      mode: "multi";
      phase: MultiUploadPhase;
      files: MultiUploadFileState[];
      totalProgress: UploadProgress;
      error: string | null;
      onCancel?: () => void;
      onPause?: () => void;
    };

export function UploadStatusBlock(props: UploadStatusBlockProps) {
  if (props.mode === "multi" && props.files.length === 1) {
    const f = props.files[0];
    return (
      <UploadStatus
        phase={props.phase}
        progress={f.progress}
        error={f.error ?? props.error}
        fileInfo={{ name: f.fileName, size: f.fileSize }}
        onCancel={props.onCancel}
        onPause={props.onPause}
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
    />
  );
}
