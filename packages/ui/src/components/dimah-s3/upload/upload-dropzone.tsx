"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@fuma-translate/react";
import {
  useUpload,
  useMultiUpload,
  type UseUploadOptions,
  type UseMultiUploadOptions,
} from "@dimah-s3/react";
import {
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import {
  DropzoneChrome,
  DropzoneFrame,
  canPauseUpload,
  dropzoneHints,
  resolveDefaultStatus,
  useMultiUploadUi,
  useSingleUploadUi,
} from "@/components/dimah-s3/upload/upload-wired";

/** Props for {@link UploadDropzone}. Extends {@link UseUploadOptions} or {@link UseMultiUploadOptions}. */
export type UploadDropzoneProps = (UseUploadOptions | UseMultiUploadOptions) &
  AttachmentLayoutAliases & {
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

function UploadDropzoneSingle({
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  attachmentSize,
  attachmentOrientation,
  ...options
}: Omit<UploadDropzoneProps, "multiple"> & UseUploadOptions) {
  const t = useTranslations();
  const ctrl = useUpload({ ...options, disabled });
  const isDisabled = disabled || ctrl.isPending;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(options, t);
  const { statusNode } = useSingleUploadUi(ctrl, {
    toast: enableToast,
    status: statusSlot,
    attachmentSize,
    attachmentOrientation,
    canPause: canPauseUpload(options.uploadStore),
  });
  const status = resolveDefaultStatus(statusSlot, statusNode, (node) => (
    <div
      className={
        hasCustomChrome ? "w-full px-3 pb-3 text-start" : "w-full text-start"
      }
    >
      {node}
    </div>
  ));

  return (
    <DropzoneFrame
      getRootProps={ctrl.getRootProps}
      getInputProps={ctrl.getInputProps}
      isDisabled={isDisabled}
      isDragReject={ctrl.isDragReject}
      isDragAccept={ctrl.isDragAccept}
      isDragActive={ctrl.isDragActive}
      className={className}
      hasCustomChrome={hasCustomChrome}
      ariaLabel={dropzoneLabel}
      chrome={
        <DropzoneChrome
          label={dropzoneLabel}
          limitsLine={limitsLine}
          acceptLine={acceptLine}
          isDisabled={isDisabled}
        >
          {children}
        </DropzoneChrome>
      }
      status={status}
    />
  );
}

function UploadDropzoneMulti({
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  attachmentSize,
  attachmentOrientation,
  ...options
}: Omit<UploadDropzoneProps, "multiple"> & UseMultiUploadOptions) {
  const t = useTranslations();
  const ctrl = useMultiUpload({ ...options, disabled });
  const isDisabled = disabled || ctrl.isPending;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(options, t);
  const { statusNode } = useMultiUploadUi(ctrl, {
    toast: enableToast,
    status: statusSlot,
    attachmentSize,
    attachmentOrientation,
    canPause: canPauseUpload(options.uploadStore),
  });
  const status = resolveDefaultStatus(statusSlot, statusNode, (node) => (
    <div
      className={
        hasCustomChrome ? "w-full px-3 pb-3 text-start" : "w-full text-start"
      }
    >
      {node}
    </div>
  ));

  return (
    <DropzoneFrame
      getRootProps={ctrl.getRootProps}
      getInputProps={ctrl.getInputProps}
      isDisabled={isDisabled}
      isDragReject={ctrl.isDragReject}
      isDragAccept={ctrl.isDragAccept}
      isDragActive={ctrl.isDragActive}
      className={className}
      hasCustomChrome={hasCustomChrome}
      ariaLabel={dropzoneLabel}
      chrome={
        <DropzoneChrome
          label={dropzoneLabel}
          limitsLine={limitsLine}
          acceptLine={acceptLine}
          isDisabled={isDisabled}
        >
          {children}
        </DropzoneChrome>
      }
      status={status}
    />
  );
}

export function UploadDropzone({ multiple, ...props }: UploadDropzoneProps) {
  const isMulti =
    multiple === true || ((props as UseMultiUploadOptions).maxFiles ?? 1) > 1;

  if (isMulti) {
    return (
      <UploadDropzoneMulti
        {...(props as Omit<UploadDropzoneProps, "multiple"> &
          UseMultiUploadOptions)}
      />
    );
  }

  return (
    <UploadDropzoneSingle
      {...(props as Omit<UploadDropzoneProps, "multiple"> & UseUploadOptions)}
    />
  );
}
