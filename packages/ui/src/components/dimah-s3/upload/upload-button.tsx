"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import type { UseUploadReturn } from "@dimah-s3/react";
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
import { useUploadUi } from "@/hooks/use-upload-ui";

/** Props for {@link UploadButton}. Pass a {@link UseUploadReturn} as `upload`. */
export type UploadButtonProps = AttachmentLayoutAliases & {
  upload: UseUploadReturn;
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
  /** Button variant. @default "default" */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Button size. @default "default" */
  size?: ComponentProps<typeof Button>["size"];
  /** Extra classes on the trigger button element. */
  buttonClassName?: string;
};

export function UploadButton({
  upload,
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
}: UploadButtonProps) {
  const t = useTranslations();
  const isDisabled = Boolean(disabled) || upload.isPending;
  const { statusNode } = useUploadUi(upload, {
    toast: enableToast,
    attachmentSize,
    attachmentOrientation,
  });
  const status = resolveStatusSlot(statusSlot, statusNode);
  const buttonLabel =
    label ??
    (upload.policy.maxFiles > 1
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
      onClick={upload.open}
    >
      {buttonContent}
    </Button>
  );

  return (
    <ButtonShell
      className={className}
      tooltipText={tooltipText}
      getInputProps={upload.getInputProps}
      button={button}
      status={status}
      inputDisabled={isDisabled}
    />
  );
}

function ButtonShell({
  className,
  tooltipText,
  getInputProps,
  button,
  status,
  inputDisabled,
}: {
  className?: string;
  tooltipText?: string;
  getInputProps: UseUploadReturn["getInputProps"];
  button: ReactElement;
  status: ReactNode;
  inputDisabled: boolean;
}) {
  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-2">
        <input {...getInputProps({ disabled: inputDisabled })} />
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
