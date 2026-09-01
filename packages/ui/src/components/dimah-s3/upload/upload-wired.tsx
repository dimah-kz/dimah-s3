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
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";
import { useUploadToast } from "@/hooks/use-upload-toast";
import { useFileRejectToast } from "@/hooks/use-file-reject-toast";

export function dropzoneHints(
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
      <input {...getInputProps({ disabled: isDisabled })} />
      {chrome}
      {status}
    </div>
  );
}

type StatusLayout = AttachmentLayoutAliases & {
  toast?: boolean;
  status?: StatusSlot;
};

export function useUploadUi(
  upload: UseUploadReturn,
  {
    toast: enableToast = true,
    status: statusSlot = true,
    attachmentSize,
    attachmentOrientation,
  }: StatusLayout,
) {
  useUploadToast(upload, enableToast);
  useFileRejectToast(upload.fileRejections, enableToast);

  const statusNode =
    statusSlot === false ? null : (
      <UploadStatus
        upload={upload}
        attachmentSize={attachmentSize}
        attachmentOrientation={attachmentOrientation}
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
