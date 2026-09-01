"use client";

import type { ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { formatAcceptLabels, type UseUploadReturn } from "@dimah-s3/react";
import { formatFileSize } from "@dimah-s3/core";
import { cn } from "@/lib/utils";
import {
  resolveStatusSlot,
  type AttachmentLayoutAliases,
  type StatusSlot,
} from "@/lib/attachment-layout";
import { useUploadUi } from "@/hooks/use-upload-ui";

function dropzoneHints(
  policy: UseUploadReturn["policy"],
  t: ReturnType<typeof useTranslations>,
) {
  const acceptLabels = formatAcceptLabels(policy.accept);
  const maxFiles = policy.maxFiles;
  const limitParts: string[] = [];
  if (maxFiles > 1) {
    limitParts.push(
      t("You can upload {count} files", {
        note: "dropzone hint",
        variables: { count: String(maxFiles) },
      }),
    );
  }
  if (policy.maxFileSize != null) {
    const size = formatFileSize(policy.maxFileSize);
    limitParts.push(
      maxFiles > 1
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

/** Props for {@link UploadDropzone}. Pass a {@link UseUploadReturn} as `upload`. */
export type UploadDropzoneProps = AttachmentLayoutAliases & {
  upload: UseUploadReturn;
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
};

export function UploadDropzone({
  upload,
  className,
  label,
  children,
  disabled,
  toast: enableToast = true,
  status: statusSlot = true,
  attachmentSize,
  attachmentOrientation,
}: UploadDropzoneProps) {
  const t = useTranslations();
  const isDisabled = Boolean(disabled) || upload.isPending;
  const hasCustomChrome = children != null;
  const dropzoneLabel =
    label ?? t("Drag and drop files here", { note: "dropzone" });
  const { limitsLine, acceptLine } = dropzoneHints(upload.policy, t);
  const { statusNode } = useUploadUi(upload, {
    toast: enableToast,
    attachmentSize,
    attachmentOrientation,
  });
  const status = resolveStatusSlot(statusSlot, statusNode, (node) => (
    <div
      className={
        hasCustomChrome ? "w-full px-3 pb-3 text-start" : "w-full text-start"
      }
    >
      {node}
    </div>
  ));

  return (
    <div
      {...upload.getRootProps({
        "aria-label": dropzoneLabel,
        "aria-disabled": isDisabled || undefined,
        className: cn(
          "rounded-lg border-2 border-dashed transition-colors",
          hasCustomChrome
            ? "flex flex-col items-stretch justify-stretch gap-3 p-0"
            : "flex flex-col items-center justify-center gap-3 p-6 text-center",
          isDisabled
            ? "pointer-events-none cursor-not-allowed border-dimah-s3-muted-foreground/25"
            : "cursor-pointer border-dimah-s3-muted-foreground/25 hover:border-dimah-s3-primary/50",
          !isDisabled &&
            upload.isDragReject &&
            "border-dimah-s3-destructive bg-dimah-s3-destructive/5",
          !isDisabled &&
            upload.isDragAccept &&
            "border-dimah-s3-primary bg-dimah-s3-primary/5",
          !isDisabled &&
            upload.isDragActive &&
            !upload.isDragAccept &&
            !upload.isDragReject &&
            "border-dimah-s3-primary/50",
          className,
        ),
      })}
    >
      <input {...upload.getInputProps({ disabled: isDisabled })} />
      {children != null ? (
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
            {limitsLine ? (
              <p className="text-xs text-dimah-s3-muted-foreground">
                {limitsLine}
              </p>
            ) : null}
            {acceptLine ? (
              <p className="text-xs text-dimah-s3-muted-foreground">
                {acceptLine}
              </p>
            ) : null}
          </div>
        </>
      )}
      {status}
    </div>
  );
}
