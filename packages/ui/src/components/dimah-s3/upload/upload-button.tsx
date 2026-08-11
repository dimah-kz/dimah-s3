"use client";

import type { ComponentProps, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useUploadControls,
  useMultiUploadControls,
  type UseUploadControlsOptions,
  type UseMultiUploadControlsOptions,
  type UploadProgress,
  type MultiUploadFileState,
} from "@dimah-s3/react";
import { cn } from "@/lib/utils";
import { resolveStatusSlot, type StatusSlot } from "@/lib/status-slot";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UploadStatusBlock } from "@/components/dimah-s3/upload/upload-status-block";
import { useUploadToast, type UploadToastCtrl } from "@/hooks/use-upload-toast";

const EMPTY_PROGRESS: UploadProgress = { loaded: 0, total: 0, percent: 0 };
const EMPTY_FILES: MultiUploadFileState[] = [];

/** Props for {@link UploadButton}. Extends {@link UseUploadControlsOptions} or {@link UseMultiUploadControlsOptions}. */
export type UploadButtonProps = (
  UseUploadControlsOptions | UseMultiUploadControlsOptions
) & {
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

export function UploadButton({
  className,
  label,
  children,
  disabled,
  tooltipText,
  toast: enableToast = true,
  status: statusSlot = true,
  multiple,
  variant = "default",
  size = "default",
  buttonClassName,
  ...options
}: UploadButtonProps) {
  const t = useTranslations();
  const isMulti =
    multiple === true ||
    ((options as UseMultiUploadControlsOptions).maxFiles ?? 1) > 1;

  // Both hooks must be called unconditionally (React rules of hooks).
  // Only the active mode's output is used.
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

  const isDisabled =
    disabled || (isMulti ? multi.isUploading : single.isUploading);

  useUploadToast(ctrl, enableToast);

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

  const status = resolveStatusSlot(statusSlot, statusNode);

  const openFilePicker = isMulti ? multi.openFilePicker : single.openFilePicker;
  const inputProps = isMulti ? multi.inputProps : single.inputProps;

  const buttonLabel =
    label ??
    (isMulti
      ? t("Upload files", { note: "button" })
      : t("Upload file", { note: "button" }));
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
      onClick={openFilePicker}
    >
      {buttonContent}
    </Button>
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <input {...inputProps} />
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
