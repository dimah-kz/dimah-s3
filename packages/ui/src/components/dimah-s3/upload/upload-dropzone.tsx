"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useUploadControls,
  useMultiUploadControls,
  formatAcceptLabels,
  type UseUploadControlsOptions,
  type UseMultiUploadControlsOptions,
  type UploadProgress,
  type MultiUploadFileState,
} from "@dimah-s3/react";
import { formatFileSize } from "@dimah-s3/core";
import { cn } from "@/lib/utils";
import { resolveStatusSlot, type StatusSlot } from "@/lib/status-slot";
import { UploadStatusBlock } from "@/components/dimah-s3/upload/upload-status-block";
import { useUploadToast, type UploadToastCtrl } from "@/hooks/use-upload-toast";

const EMPTY_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };
const EMPTY_FILES: MultiUploadFileState[] = [];

/** Props for {@link UploadDropzone}. Extends {@link UseUploadControlsOptions} or {@link UseMultiUploadControlsOptions}. */
export type UploadDropzoneProps = (
  UseUploadControlsOptions | UseMultiUploadControlsOptions
) & {
  className?: string;
  /** Dropzone label. */
  label?: string;
  /**
   * Custom dropzone chrome (icon + hints). Replaces the built-in idle content
   * only — status still renders via the `status` prop.
   */
  children?: ReactNode;
  disabled?: boolean;
  /** Show toasts during upload. @default true */
  toast?: boolean;
  /**
   * Inline status control.
   * - `true` (default): render inside the dropzone
   * - `false`: hide status
   * - `(node) => ReactNode`: wrap or relocate the status node
   */
  status?: StatusSlot;
  /**
   * Force multi-file mode. When omitted, multi mode is inferred from
   * `maxFiles > 1`.
   */
  multiple?: boolean;
};

export function UploadDropzone({
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  multiple,
  ...options
}: UploadDropzoneProps) {
  const t = useTranslations();
  const isMulti =
    multiple === true ||
    ((options as UseMultiUploadControlsOptions).maxFiles ?? 1) > 1;

  // Both hooks must be called unconditionally (React rules of hooks).
  const single = useUploadControls(options as UseUploadControlsOptions);
  const multi = useMultiUploadControls(
    options as UseMultiUploadControlsOptions,
  );

  const canPause = options.uploadStore != null && options.uploadStore !== false;

  const ctrl: UploadToastCtrl = isMulti
    ? {
        mode: "multi",
        phase: multi.phase,
        files: multi.files,
        totalProgress: multi.totalProgress,
        error: multi.error,
        cancel: multi.cancel,
      }
    : {
        mode: "single",
        phase: single.phase,
        fileInfo: single.fileInfo,
        progress: single.progress,
        error: single.error,
        cancel: single.cancel,
      };

  const [isDragOver, setIsDragOver] = useState(false);

  const isDisabled =
    disabled || (isMulti ? multi.isUploading : single.isUploading);
  const openFilePicker = isMulti ? multi.openFilePicker : single.openFilePicker;
  const dropHandlers = isMulti ? multi.dropHandlers : single.dropHandlers;
  const inputProps = isMulti ? multi.inputProps : single.inputProps;

  useUploadToast(ctrl, enableToast);

  const acceptLabels = formatAcceptLabels(options.accept);
  const maxFiles = (options as UseMultiUploadControlsOptions).maxFiles;
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
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });

  const statusNode =
    statusSlot === false ? null : isMulti ? (
      <UploadStatusBlock
        mode="multi"
        phase={multi.phase}
        files={multi.files ?? EMPTY_FILES}
        totalProgress={multi.totalProgress ?? EMPTY_PROGRESS}
        error={multi.error}
        onCancel={multi.cancel}
        onPause={canPause ? multi.detach : undefined}
      />
    ) : (
      <UploadStatusBlock
        mode="single"
        phase={single.phase}
        progress={single.progress}
        error={single.error}
        fileInfo={single.fileInfo}
        onCancel={single.cancel}
        onPause={canPause ? single.detach : undefined}
      />
    );

  const defaultStatus =
    statusNode == null ? null : (
      <div className={cn("w-full text-start", hasCustomChrome && "px-3 pb-3")}>
        {statusNode}
      </div>
    );

  const status =
    typeof statusSlot === "function"
      ? statusSlot(statusNode)
      : resolveStatusSlot(statusSlot, defaultStatus);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      aria-label={dropzoneLabel}
      className={cn(
        "rounded-lg border-2 border-dashed transition-colors",
        hasCustomChrome
          ? "flex flex-col items-stretch justify-stretch gap-3 p-0"
          : "flex flex-col items-center justify-center gap-3 p-6 text-center",
        isDisabled
          ? "cursor-not-allowed border-muted-foreground/25"
          : "cursor-pointer border-muted-foreground/25 hover:border-primary/50",
        !isDisabled && isDragOver && "border-primary/50",
        className,
      )}
      onClick={isDisabled ? undefined : openFilePicker}
      onKeyDown={onKeyDown}
      {...(isDisabled
        ? {}
        : {
            ...dropHandlers,
            onDragEnter: (e) => {
              if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
            },
            onDragLeave: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragOver(false);
              }
            },
            onDrop: (e) => {
              setIsDragOver(false);
              dropHandlers.onDrop(e);
            },
          })}
    >
      <input {...inputProps} />
      {hasCustomChrome ? (
        children
      ) : (
        <>
          <CloudUpload
            className={cn("size-6", isDisabled && "opacity-50")}
            strokeWidth={1.5}
          />
          <div
            className={cn("flex flex-col gap-1", isDisabled && "opacity-50")}
          >
            <p className="text-sm font-medium">{dropzoneLabel}</p>
            {limitsLine && (
              <p className="text-xs text-muted-foreground">{limitsLine}</p>
            )}
            {acceptLine && (
              <p className="text-xs text-muted-foreground">{acceptLine}</p>
            )}
          </div>
        </>
      )}
      {status}
    </div>
  );
}
