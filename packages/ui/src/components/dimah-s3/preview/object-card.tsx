"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "@fuma-translate/react";
import { fileNameFromKey } from "@dimah-s3/core";
import type {
  AnyDownloadReturn,
  DeleteResult,
  UseDeleteReturn,
} from "@dimah-s3/react";
import {
  FileAttachment,
  type FileAttachmentProps,
} from "@/components/dimah-s3/attachment/file-attachment";
import { Delete } from "@/components/dimah-s3/delete/delete";
import { DeleteTrigger } from "@/components/dimah-s3/delete/delete-trigger";
import {
  Download,
  isDownloadRunning,
  useFormatDownloadedBytes,
} from "@/components/dimah-s3/download/download";
import { DownloadTrigger } from "@/components/dimah-s3/download/download-trigger";
import type { AttachmentState } from "@/lib/attachment-layout";

/** Props for {@link ObjectCard}. Other props go to `FileAttachment`. */
export type ObjectCardProps = Omit<
  FileAttachmentProps,
  "state" | "fileName" | "percent" | "error" | "onCancel" | "onDismiss"
> & {
  /** Stored object key. Named `objectKey` because React reserves the `key` prop. */
  objectKey: string;
  /** Display name, and the name the browser saves. Defaults to the key's file name. */
  fileName?: string;
  /** A `useDownload` or `useFetchDownload` return. Adds a download action. */
  download?: AnyDownloadReturn;
  /** A `useDelete` return. Adds a delete action with its confirm dialog. */
  delete?: UseDeleteReturn;
  /** Called once a confirmed delete settles. Remove the card when it lists the key. */
  onDeleted?: (result: DeleteResult) => void;
};

/**
 * Card for one stored object, with download and delete actions for the
 * hooks you pass. While a `useFetchDownload` call for the key runs, the
 * card shows its progress ring and the bytes received; while the key is
 * deleting, a spinner. `actions` go before the download and delete
 * actions.
 *
 * Each card is its own `Download` and `Delete` root. It does not toast:
 * mount `DownloadToasts` and `DeleteToasts` for the hooks.
 *
 * @example
 * ```tsx
 * <ObjectCard
 *   objectKey={file.key}
 *   fileSize={file.size}
 *   download={download}
 *   delete={remove}
 *   onDeleted={(result) => result.deleted.includes(file.key) && drop(file)}
 * />
 * ```
 */
export function ObjectCard({
  objectKey,
  fileName,
  fileSize,
  download,
  delete: del,
  onDeleted,
  description,
  actions,
  ...props
}: ObjectCardProps) {
  const t = useTranslations();
  const formatDownloadedBytes = useFormatDownloadedBytes();
  const name = fileName ?? fileNameFromKey(objectKey) ?? objectKey;

  const operation =
    download?.mode === "fetch" ? download.get(objectKey) : undefined;
  const downloading = operation != null && isDownloadRunning(operation);
  const deleting = del?.get(objectKey)?.phase === "deleting";
  const state: AttachmentState = deleting
    ? "processing"
    : downloading
      ? "uploading"
      : "done";
  const percent =
    downloading &&
    operation.phase === "downloading" &&
    operation.progress.total > 0
      ? operation.progress.percent
      : 0;

  let card = (
    <FileAttachment
      state={state}
      fileName={name}
      fileSize={fileSize}
      percent={percent}
      description={
        description ??
        (deleting
          ? t("Deleting…", { note: "delete status" })
          : downloading
            ? (formatDownloadedBytes(operation.progress) ?? undefined)
            : undefined)
      }
      actions={
        actions != null || download || del ? (
          <>
            {actions}
            {download ? (
              <DownloadTrigger
                objectKey={objectKey}
                fileName={name}
                fileSize={fileSize}
                variant="ghost"
                size="icon-xs"
                aria-label={t("Download {name}", {
                  note: "attachment action",
                  variables: { name },
                })}
                tooltip={t("Download", { note: "button" })}
              >
                <DownloadIcon />
              </DownloadTrigger>
            ) : null}
            {del ? (
              <DeleteTrigger
                objectKey={objectKey}
                fileName={name}
                fileSize={fileSize}
                variant="ghost"
                size="icon-xs"
                className="hover:text-dimah-s3-destructive"
                aria-label={t("Delete {name}", {
                  note: "attachment action",
                  variables: { name },
                })}
                tooltip={t("Delete", { note: "button" })}
              >
                <Trash2Icon />
              </DeleteTrigger>
            ) : null}
          </>
        ) : undefined
      }
      {...props}
    />
  );
  if (del) {
    card = (
      <Delete delete={del} onDeleted={onDeleted}>
        {card}
      </Delete>
    );
  }
  if (download) card = <Download download={download}>{card}</Download>;
  return card;
}
