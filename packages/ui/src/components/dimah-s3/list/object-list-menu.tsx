"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { useShareExpiryLabel } from "@/lib/format-expires-in";

/** One extra row in {@link ObjectListMenu}. */
export type ObjectListMenuAction = {
  /** Row label. */
  label: string;
  onClick: () => void;
  /** Icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Destructive color. Stays above Delete, in its own group. */
  destructive?: boolean;
};

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
   * Navigate-mode `useDownload`. Adds Download.
   * Copy link uses this hook when `share` is omitted.
   */
  download?: UseNavigateDownloadReturn;
  /**
   * Navigate-mode `useDownload` used only for the copied link.
   * Pass `{ disposition: "inline" }` when the link should open in a browser
   * while `download` stays an attachment.
   */
  share?: UseNavigateDownloadReturn;
  /**
   * Requested TTL in seconds for the copied link.
   * The server signs the shorter of this value and the route cap.
   * The toast shows the TTL that was actually signed.
   */
  expiresIn?: number;
  /** `useDelete`. Adds Delete and the confirmation dialog. */
  delete?: UseDeleteReturn;
  /**
   * Called once after this row is deleted.
   * Reload the list from here (`list.refresh()`). A bulk delete does not
   * call this; the selection bar reloads once.
   */
  onDeleted?: () => void;
  /**
   * Extra rows, after Copy link and before Delete.
   * Use this for actions the menu does not provide, such as rename.
   */
  actions?: readonly ObjectListMenuAction[];
};

/**
 * Overflow menu for one object-list row. Pass it through `renderActions`.
 * It calls the download and delete hooks you already have. It does not
 * choose a route or an object key.
 *
 * Copy link signs through `share` when set, otherwise `download`, then
 * writes the URL to the clipboard. Signing does not start a download.
 * `actions` adds rows this menu does not know about, such as rename.
 */
export function ObjectListMenu({
  objectKey,
  fileName,
  fileSize,
  download,
  share,
  expiresIn,
  delete: remove,
  onDeleted,
  actions,
}: ObjectListMenuProps) {
  const t = useTranslations();
  const expiryLabel = useShareExpiryLabel();
  const linkSource = share ?? download;
  const [copying, setCopying] = useState(false);
  useRowDeleted(remove, objectKey, onDeleted);
  const downloadPending =
    download != null && download.isPending && download.objectKey === objectKey;
  const deleting = remove != null && remove.isDeleting;

  async function onCopyLink() {
    if (!linkSource || copying) return;
    setCopying(true);
    try {
      const result = await linkSource.presignMany([
        {
          key: objectKey,
          fileName,
          ...(expiresIn != null ? { expiresIn } : {}),
        },
      ]);
      const signed = result.signed[0];
      if (!signed) {
        toast.add({
          type: "error",
          title: t("Could not create link", { note: "object list menu" }),
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(signed.url);
      } catch {
        toast.add({
          type: "error",
          title: t("Could not copy link", { note: "object list menu" }),
          description: signed.url,
        });
        return;
      }
      toast.add({
        type: "success",
        title: t("Link copied", { note: "object list menu" }),
        description: expiryLabel(signed.expiresIn),
      });
    } catch {
      toast.add({
        type: "error",
        title: t("Could not create link", { note: "object list menu" }),
      });
    } finally {
      setCopying(false);
    }
  }

  const extra = actions ?? [];
  const showTransfer = download != null || linkSource != null;
  const showExtra = extra.length > 0;
  const showDelete = remove != null;
  if (!showTransfer && !showExtra && !showDelete) return null;

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
          {showTransfer ? (
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
                  disabled={copying}
                  onClick={() => void onCopyLink()}
                >
                  {copying ? (
                    <LoaderIcon className="animate-spin" />
                  ) : (
                    <LinkIcon />
                  )}
                  {t("Copy link", { note: "object list menu" })}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          ) : null}
          {showExtra && showTransfer ? <DropdownMenuSeparator /> : null}
          {showExtra ? (
            <DropdownMenuGroup>
              {extra.map((action, index) => (
                <DropdownMenuItem
                  key={`${action.label}-${index}`}
                  variant={action.destructive ? "destructive" : "default"}
                  disabled={action.disabled}
                  onClick={() => {
                    action.onClick();
                  }}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
          {showDelete && (showTransfer || showExtra) ? (
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

/**
 * Fires `onDeleted` when this row's delete reaches `success`.
 * Bulk delete leaves `objectKey` empty, so it does not match a row.
 */
function useRowDeleted(
  remove: UseDeleteReturn | undefined,
  objectKey: string,
  onDeleted: (() => void) | undefined,
) {
  const onDeletedRef = useRef(onDeleted);
  const notified = useRef(false);
  const phase = remove?.phase;
  const currentKey = remove?.objectKey;

  useEffect(() => {
    onDeletedRef.current = onDeleted;
  }, [onDeleted]);

  useEffect(() => {
    if (phase !== "success" || currentKey !== objectKey) {
      notified.current = false;
      return;
    }
    if (notified.current) return;
    notified.current = true;
    onDeletedRef.current?.();
  }, [currentKey, objectKey, phase]);
}
