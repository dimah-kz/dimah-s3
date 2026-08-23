"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useUpload,
  useMultiUpload,
  type UseUploadOptions,
  type UseMultiUploadOptions,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import {
  canPauseUpload,
  useMultiUploadUi,
  useSingleUploadUi,
} from "@/components/dimah-s3/upload/upload-wired";

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
  variant?: UploadButtonProps["variant"];
  size?: UploadButtonProps["size"];
  buttonClassName?: string;
};

function buttonShell({
  className,
  tooltipText,
  getInputProps,
  button,
  status,
}: {
  className?: string;
  tooltipText?: string;
  getInputProps: UseUploadReturn["getInputProps"];
  button: ReactElement;
  status: ReactNode;
}) {
  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <input {...getInputProps()} />
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
  const isDisabled = disabled || ctrl.isPending;
  const { statusNode } = useSingleUploadUi(ctrl, {
    toast: enableToast,
    status: statusSlot,
    attachmentSize,
    attachmentOrientation,
    canPause: canPauseUpload(options.uploadStore),
  });
  const status = resolveStatusSlot(statusSlot, statusNode);
  const buttonLabel = label ?? t("Upload file", { note: "button" });
  const buttonContent = children ?? (
    <>
      <CloudUpload data-icon="inline-start" />
      {buttonLabel}
    </>
  );

  return buttonShell({
    className,
    tooltipText,
    getInputProps: ctrl.getInputProps,
    status,
    button: (
      <Button
        variant={variant}
        size={size}
        className={buttonClassName}
        disabled={isDisabled}
        onClick={ctrl.open}
      >
        {buttonContent}
      </Button>
    ),
  });
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
  const isDisabled = disabled || ctrl.isPending;
  const { statusNode } = useMultiUploadUi(ctrl, {
    toast: enableToast,
    status: statusSlot,
    attachmentSize,
    attachmentOrientation,
    canPause: canPauseUpload(options.uploadStore),
  });
  const status = resolveStatusSlot(statusSlot, statusNode);
  const buttonLabel = label ?? t("Upload files", { note: "button" });
  const buttonContent = children ?? (
    <>
      <CloudUpload data-icon="inline-start" />
      {buttonLabel}
    </>
  );

  return buttonShell({
    className,
    tooltipText,
    getInputProps: ctrl.getInputProps,
    status,
    button: (
      <Button
        variant={variant}
        size={size}
        className={buttonClassName}
        disabled={isDisabled}
        onClick={ctrl.open}
      >
        {buttonContent}
      </Button>
    ),
  });
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
