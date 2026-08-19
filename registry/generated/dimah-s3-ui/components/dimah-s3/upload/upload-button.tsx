"use client";

import type { ComponentProps, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useUpload,
  useMultiUpload,
  type UseUploadOptions,
  type UseMultiUploadOptions,
  type UploadProgress,
  type MultiUploadFileState,
} from "@dimah-s3/react";
import { cn } from "@/registry/dimah-s3-ui/lib/utils";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/registry/dimah-s3-ui/lib/attachment-layout";
import { Button } from "@/registry/dimah-s3-ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/registry/dimah-s3-ui/components/ui/tooltip";
import { UploadStatusBlock } from "@/registry/dimah-s3-ui/components/dimah-s3/upload/upload-status-block";
import { useUploadToast, type UploadToastCtrl } from "@/registry/dimah-s3-ui/hooks/use-upload-toast";
import { useFileRejectToast } from "@/registry/dimah-s3-ui/hooks/use-file-reject-toast";

const EMPTY_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };
const EMPTY_FILES: MultiUploadFileState[] = [];

/** Props for {@link UploadButton}. Extends {@link UseUploadOptions} or {@link UseMultiUploadOptions}. */
export type UploadButtonProps = (UseUploadOptions | UseMultiUploadOptions) &
  AttachmentLayoutAliases & {
    className?: string;
    /** Button label. */
    label?: string;
    /** Custom button content. Replaces default icon + label. */
    children?: ReactNode;
    disabled?: boolean;
    tooltipText?: string;
    /** Show toasts during upload. @default true */
    toast?: boolean;
    /**
     * Inline status control.
     * - `true` (default): render below the button
     * - `false`: hide status
     * - `(node) => ReactNode`: wrap or relocate the status node
     */
    status?: StatusSlot;
    /**
     * Force multi-file mode. When omitted, multi mode is inferred from
     * `maxFiles > 1`.
     */
    multiple?: boolean;
    /** Button variant. @default "default" */
    variant?: ComponentProps<typeof Button>["variant"];
    /** Button size. @default "default" */
    size?: ComponentProps<typeof Button>["size"];
    /** Extra classes on the trigger button element. */
    buttonClassName?: string;
  };

type ButtonShellProps = AttachmentLayoutAliases & {
  className?: string;
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  tooltipText?: string;
  toast?: boolean;
  status?: StatusSlot;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  buttonClassName?: string;
};

function UploadButtonSingle({
  className,
  label,
  children,
  disabled,
  tooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  variant = "default",
  size = "default",
  buttonClassName,
  attachmentSize,
  attachmentOrientation,
  ...options
}: ButtonShellProps & UseUploadOptions) {
  const t = useTranslations();
  const ctrl = useUpload({
    ...options,
    disabled,
    noDrag: true,
    noClick: true,
    noKeyboard: true,
  });
  const canPause = options.uploadStore != null && options.uploadStore !== false;
  const isDisabled = disabled || ctrl.isUploading;

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
  const status = resolveStatusSlot(statusSlot, statusNode);

  const buttonLabel = label ?? t("Upload file", { note: "button" });
  const buttonContent = children ?? (
    <>
      <CloudUpload data-icon="inline-start" />
      {buttonLabel}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      className={buttonClassName}
      disabled={isDisabled}
      onClick={ctrl.open}
    >
      {buttonContent}
    </Button>
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <input {...ctrl.getInputProps()} />
        {tooltipText ? (
          <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent>{tooltipText}</TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
      {status}
    </div>
  );
}

function UploadButtonMulti({
  className,
  label,
  children,
  disabled,
  tooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  variant = "default",
  size = "default",
  buttonClassName,
  attachmentSize,
  attachmentOrientation,
  ...options
}: ButtonShellProps & UseMultiUploadOptions) {
  const t = useTranslations();
  const ctrl = useMultiUpload({
    ...options,
    disabled,
    noDrag: true,
    noClick: true,
    noKeyboard: true,
  });
  const canPause = options.uploadStore != null && options.uploadStore !== false;
  const isDisabled = disabled || ctrl.isUploading;

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
        size={attachmentSize}
        orientation={attachmentOrientation}
      />
    );
  const status = resolveStatusSlot(statusSlot, statusNode);

  const buttonLabel = label ?? t("Upload files", { note: "button" });
  const buttonContent = children ?? (
    <>
      <CloudUpload data-icon="inline-start" />
      {buttonLabel}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      className={buttonClassName}
      disabled={isDisabled}
      onClick={ctrl.open}
    >
      {buttonContent}
    </Button>
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <input {...ctrl.getInputProps()} />
        {tooltipText ? (
          <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent>{tooltipText}</TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
      {status}
    </div>
  );
}

export function UploadButton({ multiple, ...props }: UploadButtonProps) {
  const isMulti =
    multiple === true || ((props as UseMultiUploadOptions).maxFiles ?? 1) > 1;

  if (isMulti) {
    return (
      <UploadButtonMulti
        {...(props as ButtonShellProps & UseMultiUploadOptions)}
      />
    );
  }

  return (
    <UploadButtonSingle {...(props as ButtonShellProps & UseUploadOptions)} />
  );
}
