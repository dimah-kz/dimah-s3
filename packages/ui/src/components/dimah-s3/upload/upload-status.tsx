"use client";

import type { ComponentProps, ReactNode } from "react";
import { PauseIcon, XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useFormatDimahError,
  useFormatEta,
  useFormatNumber,
} from "@dimah-s3/react";
import { cn } from "cn";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { AttachmentAction } from "@/components/ui/attachment";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";
import {
  UploadFileItem,
  UploadFileList,
} from "@/components/dimah-s3/upload/upload-file-list";

/** Props for {@link UploadStatus}. Other props go to the wrapper `<div>`. */
export type UploadStatusProps = Omit<ComponentProps<"div">, "children">;

/**
 * Status of the nearest `Upload` queue. Renders nothing while it is idle.
 *
 * One file shows as its own card. Several files show a summary (overall
 * progress, or the result with a dismiss action) above `UploadFileList`.
 * While files upload it offers cancel, and pause when the hook has an
 * `uploadStore` so the uploads can resume. When cancel, pause or dismiss
 * removes the card that has focus, focus moves to the next action, else to
 * the root's trigger or dropzone.
 */
export function UploadStatus({ className, ...props }: UploadStatusProps) {
  const t = useTranslations();
  const { upload } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const { files, phase } = upload;
  if (phase === "idle") return null;

  const pause =
    upload.resumable && upload.isPending ? (
      <AttachmentAction
        type="button"
        aria-label={t("Pause", { note: "upload control" })}
        onClick={() => {
          keepFocus();
          upload.detach();
        }}
      >
        <PauseIcon />
      </AttachmentAction>
    ) : null;
  const onDismiss = upload.isPending
    ? undefined
    : () => {
        keepFocus();
        upload.reset();
      };

  return (
    <div
      data-slot="upload-status"
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    >
      {files.length === 0 ? (
        <StatusAttachment
          state="processing"
          title={t("Preparing…", { note: "upload status" })}
        />
      ) : files.length === 1 ? (
        <UploadFileItem file={files[0]} actions={pause} onDismiss={onDismiss} />
      ) : (
        <>
          <UploadSummary pause={pause} onDismiss={onDismiss} />
          <UploadFileList />
        </>
      )}
    </div>
  );
}

/** Overall progress or result of a queue with several files. */
function UploadSummary({
  pause,
  onDismiss,
}: {
  pause: ReactNode;
  onDismiss: (() => void) | undefined;
}) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const formatEta = useFormatEta();
  const formatNumber = useFormatNumber();
  const { upload } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const { files, progress } = upload;

  if (upload.phase === "success") {
    return (
      <StatusAttachment
        state="done"
        title={t("All {count} file(s) uploaded", {
          note: "status",
          variables: { count: formatNumber(files.length) },
        })}
        onDismiss={onDismiss}
      />
    );
  }

  if (upload.phase === "error") {
    return (
      <StatusAttachment
        state="error"
        title={t("Upload failed", { note: "status" })}
        description={upload.error ? formatError(upload.error) : undefined}
        onDismiss={onDismiss}
      />
    );
  }

  const eta = formatEta(progress);
  return (
    <div className="flex w-full items-center gap-1.5">
      <Progress value={progress.percent} className="min-w-0 flex-1">
        <ProgressLabel>
          {t("{done}/{total} files", {
            note: "upload progress",
            variables: {
              done: formatNumber(
                files.filter((file) => file.phase === "success").length,
              ),
              total: formatNumber(files.length),
            },
          })}
          {eta ? (
            <span className="font-normal text-dimah-s3-muted-foreground">
              {" "}
              · {eta}
            </span>
          ) : null}
        </ProgressLabel>
        <ProgressValue />
      </Progress>
      {pause}
      <AttachmentAction
        type="button"
        className="shrink-0"
        aria-label={t("Cancel all uploads", { note: "upload control" })}
        onClick={() => {
          keepFocus();
          upload.cancel();
        }}
      >
        <XIcon />
      </AttachmentAction>
    </div>
  );
}
