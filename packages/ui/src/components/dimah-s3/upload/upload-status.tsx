"use client";

import type { ComponentProps, ReactNode } from "react";
import { PauseIcon, XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useFormatDimahError,
  useFormatEta,
  useFormatFileSize,
  useFormatNumber,
} from "@dimah-s3/react";
import { cn } from "cn";
import { CircleProgress } from "@/components/dimah-s3/attachment/circle-progress";
import { StatusAttachment } from "@/components/dimah-s3/attachment/status-attachment";
import { AttachmentAction } from "@/components/ui/attachment";
import {
  useUploadContext,
  useUploadFocus,
} from "@/components/dimah-s3/upload/upload";
import {
  UploadFileItem,
  UploadFileList,
  type UploadFileListLayout,
} from "@/components/dimah-s3/upload/upload-file-list";

/** Props for {@link UploadStatus}. Other props go to the wrapper `<div>`. */
export type UploadStatusProps = Omit<ComponentProps<"div">, "children"> & {
  /** Layout of the files, as on `UploadFileList`. @default "list" */
  layout?: UploadFileListLayout;
};

/** A summary header and its files share one card; the rows inside drop their own. */
const ROW_CLASS = "rounded-none border-0 bg-transparent";

/**
 * Status of the nearest `Upload` queue. Renders nothing while it is idle.
 *
 * One file shows as its own card. Several files show as one card: a summary
 * header with the overall progress ring, the count and the time left (or
 * the result once they settle), above a row for each file. The rows scroll
 * past 20rem. While files upload the summary offers "Cancel all uploads",
 * and pause when the hook has an `uploadStore` so the uploads can resume;
 * settled, it offers dismiss. With `layout="grid"` the files show as tiles
 * under the summary, also for one file.
 *
 * Inside an `UploadField` (a root with `hideUploaded`), files that uploaded
 * leave the status, since the field's value lists them. When cancel, pause
 * or dismiss removes the card that has focus, focus moves to the next
 * action, else to the root's trigger or dropzone. It sets `data-phase` to
 * the hook's phase.
 */
export function UploadStatus({
  layout = "list",
  className,
  ...props
}: UploadStatusProps) {
  const t = useTranslations();
  const { upload, hideUploaded } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const { files, phase } = upload;
  const shown = hideUploaded
    ? files.filter((file) => file.phase !== "success")
    : files;
  if (phase === "idle" || (files.length > 0 && shown.length === 0)) {
    return null;
  }

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
      data-phase={phase}
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    >
      {files.length === 0 ? (
        <StatusAttachment
          state="processing"
          title={t("Preparing…", { note: "upload status" })}
        />
      ) : files.length === 1 && layout === "list" ? (
        <UploadFileItem file={files[0]} actions={pause} onDismiss={onDismiss} />
      ) : (
        <div
          data-slot="upload-status-panel"
          className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground"
        >
          <UploadSummary pause={pause} onDismiss={onDismiss} />
          <UploadFileList
            layout={layout}
            className={cn(
              "max-h-80 overflow-y-auto border-t border-dimah-s3-border",
              layout === "list"
                ? "gap-0 divide-y divide-dimah-s3-border"
                : "p-2",
            )}
          >
            {layout === "list"
              ? (file) => <UploadFileItem file={file} className={ROW_CLASS} />
              : undefined}
          </UploadFileList>
        </div>
      )}
    </div>
  );
}

/** The header of a queue with several files: its progress, or its result. */
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
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const { upload } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const { files, progress } = upload;

  if (upload.phase === "success") {
    return (
      <StatusAttachment
        state="done"
        className={ROW_CLASS}
        title={
          files.length === 1
            ? t("Upload complete", { note: "upload status" })
            : t("All {count} files uploaded", {
                note: "status",
                variables: { count: formatNumber(files.length) },
              })
        }
        description={formatFileSize(
          files.reduce((total, file) => total + file.fileSize, 0),
        )}
        onDismiss={onDismiss}
      />
    );
  }

  if (upload.phase === "error") {
    return (
      <StatusAttachment
        state="error"
        className={ROW_CLASS}
        title={t("Upload failed", { note: "status" })}
        description={upload.error ? formatError(upload.error) : undefined}
        onDismiss={onDismiss}
      />
    );
  }

  const percent = Math.round(Math.min(100, Math.max(0, progress.percent)));
  const eta = formatEta(progress);
  return (
    <StatusAttachment
      state="uploading"
      className={ROW_CLASS}
      media={
        <CircleProgress
          percent={percent}
          label={t("Upload progress", { note: "progress" })}
          strokeWidth={2}
          className="size-5"
        />
      }
      title={t("{done} of {total} files uploaded", {
        note: "upload progress",
        variables: {
          done: formatNumber(
            files.filter((file) => file.phase === "success").length,
          ),
          total: formatNumber(files.length),
        },
      })}
      description={
        <span className="tabular-nums">
          {t("{percent}%", {
            note: "progress",
            variables: { percent: formatNumber(percent) },
          })}
          {eta ? ` · ${eta}` : null}
        </span>
      }
      actions={
        <>
          {pause}
          <AttachmentAction
            type="button"
            aria-label={t("Cancel all uploads", { note: "upload control" })}
            onClick={() => {
              keepFocus();
              upload.cancel();
            }}
          >
            <XIcon />
          </AttachmentAction>
        </>
      }
    />
  );
}
