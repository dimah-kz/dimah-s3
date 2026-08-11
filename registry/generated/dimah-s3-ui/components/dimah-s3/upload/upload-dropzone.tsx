"use client";

import type { ReactNode } from "react";
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
import { cn } from "@/registry/dimah-s3-ui/lib/utils";
import { resolveStatusSlot, type StatusSlot } from "@/registry/dimah-s3-ui/lib/status-slot";
import { UploadStatusBlock } from "@/registry/dimah-s3-ui/components/dimah-s3/upload/upload-status-block";
import { useUploadToast, type UploadToastCtrl } from "@/registry/dimah-s3-ui/hooks/use-upload-toast";
import { useFileRejectToast } from "@/registry/dimah-s3-ui/hooks/use-file-reject-toast";

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

function dropzoneHints(
  options: UseUploadControlsOptions | UseMultiUploadControlsOptions,
  t: ReturnType<typeof useTranslations>,
) {
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
  return { limitsLine, acceptLine };
}

function DropzoneChrome({
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
          <p className="text-xs text-muted-foreground">{limitsLine}</p>
        )}
        {acceptLine && (
          <p className="text-xs text-muted-foreground">{acceptLine}</p>
        )}
      </div>
    </>
  );
}

function UploadDropzoneSingle({
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  ...options
}: Omit<UploadDropzoneProps, "multiple"> & UseUploadControlsOptions) {
  const t = useTranslations();
  const ctrl = useUploadControls({ ...options, disabled });
  const canPause = options.uploadStore != null && options.uploadStore !== false;
  const isDisabled = disabled || ctrl.isUploading;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(options, t);

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

  return (
    <div
      {...ctrl.getRootProps({
        "aria-label": dropzoneLabel,
        className: cn(
          "rounded-lg border-2 border-dashed transition-colors",
          hasCustomChrome
            ? "flex flex-col items-stretch justify-stretch gap-3 p-0"
            : "flex flex-col items-center justify-center gap-3 p-6 text-center",
          isDisabled
            ? "cursor-not-allowed border-muted-foreground/25"
            : "cursor-pointer border-muted-foreground/25 hover:border-primary/50",
          !isDisabled &&
            ctrl.isDragReject &&
            "border-destructive bg-destructive/5",
          !isDisabled &&
            ctrl.isDragAccept &&
            "border-primary bg-primary/5",
          !isDisabled &&
            ctrl.isDragActive &&
            !ctrl.isDragAccept &&
            !ctrl.isDragReject &&
            "border-primary/50",
          className,
        ),
      })}
    >
      <input {...ctrl.getInputProps()} />
      <DropzoneChrome
        label={dropzoneLabel}
        limitsLine={limitsLine}
        acceptLine={acceptLine}
        isDisabled={isDisabled}
      >
        {children}
      </DropzoneChrome>
      {status}
    </div>
  );
}

function UploadDropzoneMulti({
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  ...options
}: Omit<UploadDropzoneProps, "multiple"> & UseMultiUploadControlsOptions) {
  const t = useTranslations();
  const ctrl = useMultiUploadControls({ ...options, disabled });
  const canPause = options.uploadStore != null && options.uploadStore !== false;
  const isDisabled = disabled || ctrl.isUploading;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(options, t);

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
        files={ctrl.files ?? EMPTY_FILES}
        totalProgress={ctrl.totalProgress ?? EMPTY_PROGRESS}
        error={ctrl.error}
        onCancel={ctrl.cancel}
        onPause={canPause ? ctrl.detach : undefined}
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

  return (
    <div
      {...ctrl.getRootProps({
        "aria-label": dropzoneLabel,
        className: cn(
          "rounded-lg border-2 border-dashed transition-colors",
          hasCustomChrome
            ? "flex flex-col items-stretch justify-stretch gap-3 p-0"
            : "flex flex-col items-center justify-center gap-3 p-6 text-center",
          isDisabled
            ? "cursor-not-allowed border-muted-foreground/25"
            : "cursor-pointer border-muted-foreground/25 hover:border-primary/50",
          !isDisabled &&
            ctrl.isDragReject &&
            "border-destructive bg-destructive/5",
          !isDisabled &&
            ctrl.isDragAccept &&
            "border-primary bg-primary/5",
          !isDisabled &&
            ctrl.isDragActive &&
            !ctrl.isDragAccept &&
            !ctrl.isDragReject &&
            "border-primary/50",
          className,
        ),
      })}
    >
      <input {...ctrl.getInputProps()} />
      <DropzoneChrome
        label={dropzoneLabel}
        limitsLine={limitsLine}
        acceptLine={acceptLine}
        isDisabled={isDisabled}
      >
        {children}
      </DropzoneChrome>
      {status}
    </div>
  );
}

export function UploadDropzone({
  multiple,
  ...props
}: UploadDropzoneProps) {
  const isMulti =
    multiple === true ||
    ((props as UseMultiUploadControlsOptions).maxFiles ?? 1) > 1;

  if (isMulti) {
    return (
      <UploadDropzoneMulti
        {...(props as Omit<UploadDropzoneProps, "multiple"> &
          UseMultiUploadControlsOptions)}
      />
    );
  }

  return (
    <UploadDropzoneSingle
      {...(props as Omit<UploadDropzoneProps, "multiple"> &
        UseUploadControlsOptions)}
    />
  );
}
