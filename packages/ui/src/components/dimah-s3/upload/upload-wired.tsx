"use client";

import type { ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  formatAcceptLabels,
  type UseUploadOptions,
  type UseMultiUploadOptions,
  type UseUploadReturn,
  type UseMultiUploadReturn,
} from "@dimah-s3/react";
import { formatFileSize } from "@dimah-s3/core";
import { cn } from "@/lib/utils";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import { UploadStatusBlock } from "@/components/dimah-s3/upload/upload-status-block";
import { useUploadToast, type UploadToastCtrl } from "@/hooks/use-upload-toast";
import { useFileRejectToast } from "@/hooks/use-file-reject-toast";

export function canPauseUpload(
  uploadStore: UseUploadOptions["uploadStore"],
): boolean {
  return uploadStore != null && uploadStore !== false;
}

export function dropzoneHints(
  options: UseUploadOptions | UseMultiUploadOptions,
  t: ReturnType<typeof useTranslations>,
) {
  const acceptLabels = formatAcceptLabels(options.accept);
  const maxFiles = (options as UseMultiUploadOptions).maxFiles;
  const limitParts: string[] = [];
  if (maxFiles != null && maxFiles > 0) {
    limitParts.push(
      maxFiles === 1
        ? t("You can upload a file", { note: "dropzone hint" })
        : t("You can upload {count} files", {
            note: "dropzone hint",
            variables: { count: String(maxFiles) },
          }),
    );
  }
  if (options.maxFileSize != null) {
    const size = formatFileSize(options.maxFileSize);
    limitParts.push(
      maxFiles != null && maxFiles > 1
        ? t("Each up to {size}", {
            note: "dropzone hint",
            variables: { size },
          })
        : t("Up to {size}", {
            note: "dropzone hint",
            variables: { size },
          }),
    );
  }
  const limitsLine = limitParts.length > 0 ? `${limitParts.join(". ")}.` : null;
  const acceptLine =
    acceptLabels.length > 0
      ? t("Accepted {types}.", {
          note: "dropzone hint",
          variables: { types: acceptLabels.join(", ") },
        })
      : null;
  return { limitsLine, acceptLine };
}

export function DropzoneChrome({
  label,
  limitsLine,
  acceptLine,
  isDisabled,
  children,
}: {
  label: string;
  limitsLine: string | null;
  acceptLine: string | null;
  isDisabled: boolean;
  children?: ReactNode;
}) {
  if (children != null) return <>{children}</>;
  return (
    <>
      <CloudUpload
        className={cn("size-6", isDisabled && "opacity-50")}
        strokeWidth={1.5}
      />
      <div className={cn("flex flex-col gap-1", isDisabled && "opacity-50")}>
        <p className="text-sm font-medium">{label}</p>
        {limitsLine && (
          <p className="text-xs text-dimah-s3-muted-foreground">{limitsLine}</p>
        )}
        {acceptLine && (
          <p className="text-xs text-dimah-s3-muted-foreground">{acceptLine}</p>
        )}
      </div>
    </>
  );
}

export function DropzoneFrame({
  getRootProps,
  getInputProps,
  isDisabled,
  isDragReject,
  isDragAccept,
  isDragActive,
  className,
  hasCustomChrome,
  ariaLabel,
  chrome,
  status,
}: {
  getRootProps: UseUploadReturn["getRootProps"];
  getInputProps: UseUploadReturn["getInputProps"];
  isDisabled: boolean;
  isDragReject: boolean;
  isDragAccept: boolean;
  isDragActive: boolean;
  className?: string;
  hasCustomChrome: boolean;
  ariaLabel: string;
  chrome: ReactNode;
  status: ReactNode;
}) {
  return (
    <div
      {...getRootProps({
        "aria-label": ariaLabel,
        className: cn(
          "rounded-lg border-2 border-dashed transition-colors",
          hasCustomChrome
            ? "flex flex-col items-stretch justify-stretch gap-3 p-0"
            : "flex flex-col items-center justify-center gap-3 p-6 text-center",
          isDisabled
            ? "cursor-not-allowed border-dimah-s3-muted-foreground/25"
            : "cursor-pointer border-dimah-s3-muted-foreground/25 hover:border-dimah-s3-primary/50",
          !isDisabled &&
            isDragReject &&
            "border-dimah-s3-destructive bg-dimah-s3-destructive/5",
          !isDisabled &&
            isDragAccept &&
            "border-dimah-s3-primary bg-dimah-s3-primary/5",
          !isDisabled &&
            isDragActive &&
            !isDragAccept &&
            !isDragReject &&
            "border-dimah-s3-primary/50",
          className,
        ),
      })}
    >
      <input {...getInputProps()} />
      {chrome}
      {status}
    </div>
  );
}

type StatusLayout = AttachmentLayoutAliases & {
  toast?: boolean;
  status?: StatusSlot;
};

export function useSingleUploadUi(
  ctrl: UseUploadReturn,
  {
    toast: enableToast = true,
    status: statusSlot = true,
    attachmentSize,
    attachmentOrientation,
    canPause,
  }: StatusLayout & { canPause: boolean },
) {
  const toastCtrl: UploadToastCtrl = {
    mode: "single",
    phase: ctrl.phase,
    fileInfo: ctrl.fileInfo,
    progress: ctrl.progress,
    error: ctrl.error,
    cancel: ctrl.cancel,
  };
  useUploadToast(toastCtrl, enableToast);
  useFileRejectToast(ctrl.fileRejections, enableToast);

  const statusNode =
    statusSlot === false ? null : (
      <UploadStatusBlock
        mode="single"
        phase={ctrl.phase}
        progress={ctrl.progress}
        error={ctrl.error}
        fileInfo={ctrl.fileInfo}
        onCancel={ctrl.cancel}
        onPause={canPause ? ctrl.detach : undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    );

  return { statusNode, statusSlot };
}

export function useMultiUploadUi(
  ctrl: UseMultiUploadReturn,
  {
    toast: enableToast = true,
    status: statusSlot = true,
    attachmentSize,
    attachmentOrientation,
    canPause,
  }: StatusLayout & { canPause: boolean },
) {
  const toastCtrl: UploadToastCtrl = {
    mode: "multi",
    phase: ctrl.phase,
    files: ctrl.files,
    totalProgress: ctrl.totalProgress,
    error: ctrl.error,
    cancel: ctrl.cancel,
  };
  useUploadToast(toastCtrl, enableToast);
  useFileRejectToast(ctrl.fileRejections, enableToast);

  const statusNode =
    statusSlot === false ? null : (
      <UploadStatusBlock
        mode="multi"
        phase={ctrl.phase}
        files={ctrl.files}
        totalProgress={ctrl.totalProgress}
        error={ctrl.error}
        onCancel={ctrl.cancel}
        onPause={canPause ? ctrl.detach : undefined}
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    );

  return { statusNode, statusSlot };
}

export function resolveDefaultStatus(
  statusSlot: StatusSlot,
  statusNode: ReactNode,
  wrap?: (node: ReactNode) => ReactNode,
) {
  if (typeof statusSlot === "function") return statusSlot(statusNode);
  const defaultStatus =
    statusNode == null ? null : wrap ? wrap(statusNode) : statusNode;
  return resolveStatusSlot(statusSlot, defaultStatus);
}
