"use client";

import type { ComponentProps, ReactNode } from "react";
import { PauseIcon, PlayIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import {
  useFormatError,
  useFormatEta,
  useFormatFileSize,
  useFormatNumber,
  type UploadFileState,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { DEFAULT_MULTIPART_THRESHOLD } from "@dimah-s3/react/engine";
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

const PAUSABLE = new Set<UploadFileState["phase"]>([
  "queued",
  "preparing",
  "presigning",
  "uploading",
]);

/**
 * Whether a file in flight keeps its progress across a pause: a multipart
 * upload. A single-shot upload would start over, so it offers no pause.
 */
function canPause(upload: UseUploadReturn): boolean {
  return (
    upload.policy.multipart &&
    upload.files.some(
      (file) =>
        PAUSABLE.has(file.phase) &&
        file.fileSize >= DEFAULT_MULTIPART_THRESHOLD,
    )
  );
}

/**
 * Status of the nearest `Upload` queue. Renders nothing while it is idle.
 *
 * One file shows as its own card. Several files show as one card: a summary
 * header with the overall progress ring, the count and the time left (or
 * the result once they settle), above a row for each file. The rows scroll
 * past 20rem. While files upload the summary offers "Cancel all uploads",
 * and pause while a multipart upload is in flight, since it resumes from
 * its uploaded parts. While files are paused and none is in flight it
 * offers resume; a paused file also has its own resume action. Settled, it offers dismiss, and "Retry failed uploads" when files
 * failed. A failed file has its own retry action. In a full root, as in a
 * full `UploadField`, the retry actions stay focusable but are
 * `aria-disabled`. With `layout="grid"` the files show as tiles under the
 * summary, also for one file.
 *
 * Inside an `UploadField` (a root with `hideUploaded`), files that uploaded
 * leave the status, since the field's value lists them. When cancel, pause,
 * resume or dismiss removes the action that has focus, focus moves to the
 * next action, else to the root's trigger or dropzone. It sets `data-phase`
 * to the hook's phase.
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

  // One slot, so focus stays on it as pause turns into resume.
  const control = canPause(upload) ? (
    <AttachmentAction
      type="button"
      aria-label={t("Pause", { note: "upload control" })}
      onClick={() => {
        keepFocus();
        upload.pause();
      }}
    >
      <PauseIcon />
    </AttachmentAction>
  ) : phase === "paused" && shown.length > 1 ? (
    <AttachmentAction
      type="button"
      aria-label={t("Resume", { note: "upload control" })}
      onClick={() => {
        keepFocus();
        upload.resume();
      }}
    >
      <PlayIcon />
    </AttachmentAction>
  ) : null;
  const onDismiss =
    upload.isPending || phase === "paused"
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
      ) : shown.length === 1 && layout === "list" ? (
        <UploadFileItem
          file={shown[0]}
          actions={control}
          onDismiss={onDismiss}
        />
      ) : (
        <div
          data-slot="upload-status-panel"
          className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-dimah-s3-border bg-dimah-s3-card text-dimah-s3-card-foreground"
        >
          <UploadSummary control={control} onDismiss={onDismiss} />
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
  control,
  onDismiss,
}: {
  /** Pause or resume for the whole queue, or `null`. */
  control: ReactNode;
  onDismiss: (() => void) | undefined;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatEta = useFormatEta();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const { upload, isFull } = useUploadContext();
  const { keepFocus } = useUploadFocus();
  const { files, progress } = upload;
  // Retry and cancel share a slot, so focus stays on it as a retry starts.
  const summaryActions = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <>
      {control}
      <AttachmentAction
        type="button"
        aria-label={label}
        disabled={disabled}
        focusableWhenDisabled={disabled}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={onClick}
      >
        {icon}
      </AttachmentAction>
    </>
  );

  if (upload.phase === "success") {
    return (
      <StatusAttachment
        state="done"
        className={ROW_CLASS}
        title={
          files.length === 1
            ? t("Upload complete", { note: "upload status" })
            : t("All {count} files uploaded", {
                note: "upload status",
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
        title={t("Upload failed", { note: "upload status" })}
        description={upload.error ? formatError(upload.error) : undefined}
        actions={summaryActions(
          t("Retry failed uploads", { note: "upload control" }),
          <RotateCwIcon />,
          () => void upload.retry(),
          isFull,
        )}
        onDismiss={onDismiss}
      />
    );
  }

  const percent = Math.round(Math.min(100, Math.max(0, progress.percent)));
  const paused = upload.phase === "paused";
  const eta = paused ? null : formatEta(progress);
  return (
    <StatusAttachment
      state={paused ? "idle" : "uploading"}
      className={ROW_CLASS}
      media={
        <CircleProgress
          percent={percent}
          label={t("Upload progress", { note: "upload progress" })}
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
          {paused ? ` · ${t("Paused", { note: "upload status" })}` : null}
          {eta ? ` · ${eta}` : null}
        </span>
      }
      actions={summaryActions(
        t("Cancel all uploads", { note: "upload control" }),
        <XIcon />,
        () => {
          keepFocus();
          upload.cancel();
        },
      )}
    />
  );
}
