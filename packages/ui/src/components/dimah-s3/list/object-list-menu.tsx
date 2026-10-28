"use client";

import {
  formatFileSize,
  fileNameFromKey,
  truncateFileName,
} from "@dimah-s3/core";
import type {
  UseDeleteReturn,
  UseNavigateDownloadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  DownloadIcon,
  LinkIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useDeleteToast } from "@/hooks/use-delete-toast";
import { useDownloadToast } from "@/hooks/use-download-toast";

/** Props for {@link ObjectListMenu}. */
export type ObjectListMenuProps = {
  /**
   * S3 object key. Named `objectKey` because React reserves `key`.
   */
  objectKey: string;
  /** Download filename and confirmation label. */
  fileName?: string;
  /** Shown in the delete confirmation. */
  fileSize?: number;
  /**
   * Navigate-mode `useDownload`. Adds Download, and Copy link when `share`
   * is omitted. The copied URL uses this hook's disposition.
   */
  download?: UseNavigateDownloadReturn;
  /**
   * Navigate-mode `useDownload` used only for the temporary link.
   * Pass `{ disposition: "inline" }` when the link should open in a browser
   * while `download` stays an attachment.
   */
  share?: UseNavigateDownloadReturn;
  /** `useDelete`. Adds Delete and the confirmation dialog. */
  delete?: UseDeleteReturn;
};

/**
 * Overflow menu for one object-list row. Pass it through `renderActions`.
 * It calls the download and delete hooks you already have. It does not
 * choose a route or an object key.
 */
export function ObjectListMenu({
  objectKey,
  fileName,
  fileSize,
  download,
  share,
  delete: remove,
}: ObjectListMenuProps) {
  const t = useTranslations();
  const linkSource = share ?? download;
  const downloadPending =
    download != null && download.isPending && download.objectKey === objectKey;
  const linkPending =
    linkSource != null &&
    linkSource.isPending &&
    linkSource.objectKey === objectKey;
  const deleting = remove != null && remove.isDeleting;

  async function copyLink(source: UseNavigateDownloadReturn) {
    const signed = await source.presign(objectKey, fileName);
    if (!signed) return;
    const seconds = signed.expiresIn;
    const hours = Math.max(1, Math.round(seconds / 3600));
    const minutes = Math.max(1, Math.round(seconds / 60));
    const description =
      seconds >= 3600
        ? hours === 1
          ? t("Expires in 1 hour", { note: "object list menu" })
          : t("Expires in {count} hours", {
              note: "object list menu",
              variables: { count: String(hours) },
            })
        : seconds >= 60
          ? minutes === 1
            ? t("Expires in 1 minute", { note: "object list menu" })
            : t("Expires in {count} minutes", {
                note: "object list menu",
                variables: { count: String(minutes) },
              })
          : seconds === 1
            ? t("Expires in 1 second", { note: "object list menu" })
            : t("Expires in {count} seconds", {
                note: "object list menu",
                variables: { count: String(Math.max(1, seconds)) },
              });
    toast.add({
      type: "success",
      title: t("Temporary link", { note: "object list menu" }),
      description,
      actionProps: {
        children: t("Copy", { note: "object list menu" }),
        onClick: () => {
          void navigator.clipboard.writeText(signed.url).then(
            () => {
              toast.add({
                type: "success",
                title: t("Link copied", { note: "object list menu" }),
              });
            },
            () => {
              toast.add({
                type: "error",
                title: t("Could not copy link", { note: "object list menu" }),
              });
            },
          );
        },
      },
    });
  }

  if (download == null && linkSource == null && remove == null) return null;

  return (
    <>
      {download ? (
        <DownloadToasts
          download={download}
          objectKey={objectKey}
          fileName={fileName}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontalIcon />
          <span className="sr-only">
            {t("File actions", { note: "object list menu" })}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {download || linkSource ? (
            <DropdownMenuGroup>
              {download ? (
                <DropdownMenuItem
                  disabled={downloadPending}
                  onClick={() => void download.download(objectKey, fileName)}
                >
                  {downloadPending ? (
                    <LoaderIcon className="animate-spin" />
                  ) : (
                    <DownloadIcon />
                  )}
                  {t("Download", { note: "button" })}
                </DropdownMenuItem>
              ) : null}
              {linkSource ? (
                <DropdownMenuItem
                  disabled={linkPending}
                  onClick={() => void copyLink(linkSource)}
                >
                  {linkPending ? (
                    <LoaderIcon className="animate-spin" />
                  ) : (
                    <LinkIcon />
                  )}
                  {t("Copy link", { note: "object list menu" })}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          ) : null}
          {remove && (download || linkSource) ? (
            <DropdownMenuSeparator />
          ) : null}
          {remove ? (
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onClick={() => remove.requestDelete(objectKey)}
              >
                {remove.isDeleting && remove.objectKey === objectKey ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <Trash2Icon />
                )}
                {t("Delete", { note: "button" })}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {remove ? (
        <DeleteConfirm
          remove={remove}
          objectKey={objectKey}
          fileName={fileName}
          fileSize={fileSize}
        />
      ) : null}
    </>
  );
}

function DownloadToasts({
  download,
  objectKey,
  fileName,
}: {
  download: UseNavigateDownloadReturn;
  objectKey: string;
  fileName?: string;
}) {
  useDownloadToast(download, { objectKey, fileName });
  return null;
}

function DeleteConfirm({
  remove,
  objectKey,
  fileName,
  fileSize,
}: {
  remove: UseDeleteReturn;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
}) {
  const t = useTranslations();
  const displayName = fileName ?? fileNameFromKey(objectKey) ?? objectKey;
  const isThis = remove.objectKey === objectKey;
  useDeleteToast(remove, { objectKey, displayName });

  const fileLabel =
    fileSize != null
      ? `${truncateFileName(displayName)} (${formatFileSize(fileSize)})`
      : truncateFileName(displayName);

  return (
    <AlertDialog
      open={remove.isConfirming && isThis}
      onOpenChange={(open) => {
        if (!open) remove.cancelDelete();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("Delete file?", { note: "dialog title" })}
          </AlertDialogTitle>
          <AlertDialogDescription
            dir="auto"
            className="[overflow-wrap:anywhere]"
          >
            {t(
              'Are you sure you want to delete "{name}"? This action cannot be undone.',
              {
                note: "dialog description",
                variables: { name: isolateLtr(fileLabel) },
              },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("Cancel", { note: "dialog button" })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void remove.confirmDelete()}
          >
            {t("Delete", { note: "dialog confirm" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isolateLtr(value: string): string {
  return `\u2066${value}\u2069`;
}
