"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fileNameFromKey, truncateFileName } from "@dimah-s3/core";
import {
  objectKeyOf,
  useFormatFileSize,
  type UseDeleteReturn,
  type UseNavigateDownloadReturn,
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
import {
  useObjectListEntry,
  useOptionalObjectListContext,
} from "@/components/dimah-s3/list/object-list-context";
import { useDeleteToast } from "@/hooks/use-delete-toast";
import { useDownloadToast } from "@/hooks/use-download-toast";
import { useShareExpiryLabel } from "@/lib/format-expires-in";
import { isolateText } from "@/lib/isolate-text";

/** One extra row in {@link ObjectListItemMenu}. */
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

/** Props for {@link ObjectListItemMenu}. */
export type ObjectListItemMenuProps = {
  /**
   * S3 object key. Inside an `ObjectList` row it defaults to the entry's
   * `objectKey`. Named `objectKey` because React reserves `key`.
   */
  objectKey?: string;
  /** Download filename and confirmation label. Defaults to the entry name. */
  fileName?: string;
  /** Shown in the delete confirmation. Defaults to the entry size. */
  fileSize?: number | null;
  /**
   * Navigate-mode `useDownload`. Adds Download.
   * Inside an `ObjectList` it defaults to the list's `download`.
   */
  download?: UseNavigateDownloadReturn;
  /**
   * Navigate-mode `useDownload` used only for Copy link. Falls back to
   * `download`. Pass `{ disposition: "inline" }` when the link should open
   * in a browser while Download stays an attachment.
   */
  share?: UseNavigateDownloadReturn;
  /**
   * Requested TTL in seconds for the copied link.
   * The server signs the shorter of this value and the route cap.
   * The toast shows the TTL that was actually signed.
   */
  expiresIn?: number;
  /**
   * `useDelete`. Adds Delete and the confirmation dialog.
   * Inside an `ObjectList` it defaults to the list's `delete`, and the list
   * drops the row and reloads after the delete.
   */
  delete?: UseDeleteReturn;
  /** Called once after this file is deleted. */
  onDeleted?: () => void;
  /**
   * Extra rows, after Copy link and before Delete.
   * Use this for actions the menu does not provide, such as rename.
   */
  actions?: readonly ObjectListMenuAction[];
  /** More `DropdownMenuItem`s, after `actions`. */
  children?: ReactNode;
  /** Classes on the trigger button. */
  className?: string;
};

/**
 * Overflow menu for one file: Download, Copy link, your actions, Delete.
 * It calls the download and delete hooks you already have. It does not
 * choose a route.
 *
 * Inside an `ObjectList` row every prop is optional: the key, name, size,
 * and hooks come from the entry and the list, and the list owns the delete
 * dialog and toasts. Outside a list, pass `objectKey` and the hooks.
 *
 * Copy link signs through `share` when set, otherwise `download`, then
 * writes the URL to the clipboard. Signing does not start a download.
 */
export function ObjectListItemMenu({
  objectKey: objectKeyProp,
  fileName: fileNameProp,
  fileSize: fileSizeProp,
  download: downloadProp,
  share: shareProp,
  expiresIn,
  delete: deleteProp,
  onDeleted,
  actions,
  children,
  className,
}: ObjectListItemMenuProps) {
  const t = useTranslations();
  const expiryLabel = useShareExpiryLabel();
  const context = useOptionalObjectListContext();
  const entry = useObjectListEntry();
  const file = entry?.kind === "file" ? entry : null;
  const objectKey = objectKeyProp ?? (file ? objectKeyOf(file) : "");
  const fileName = fileNameProp ?? file?.file.name;
  const fileSize = fileSizeProp ?? file?.file.size ?? undefined;
  const download = downloadProp ?? context?.download ?? undefined;
  const remove = deleteProp ?? context?.remove ?? undefined;
  const linkSource = shareProp ?? context?.share ?? download;
  // The list draws one dialog and one set of toasts for its own hooks.
  const listDelete =
    remove != null && remove.requestDelete === context?.remove?.requestDelete;
  const listDownload =
    download != null && download.presignMany === context?.download?.presignMany;
  const [copying, setCopying] = useState(false);
  useFileDeleted(remove, objectKey, onDeleted);
  const downloadPending =
    download != null && download.isPending && download.objectKey === objectKey;
  const deleting = remove?.isDeleting === true;

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
  const showExtra = extra.length > 0 || children != null;
  if (!objectKey || (!showTransfer && !showExtra && remove == null)) {
    return null;
  }

  return (
    <>
      {download && !listDownload ? (
        <ObjectDownloadToasts
          download={download}
          objectKey={objectKey}
          fileName={fileName}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              data-slot="object-list-item-menu"
              className={className}
            />
          }
        >
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
              {children}
            </DropdownMenuGroup>
          ) : null}
          {remove && (showTransfer || showExtra) ? (
            <DropdownMenuSeparator />
          ) : null}
          {remove ? (
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onClick={() => remove.requestDelete(objectKey)}
              >
                {deleting && remove.objectKey === objectKey ? (
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
      {remove && !listDelete ? (
        <ObjectDeleteDialog
          remove={remove}
          target={{ objectKey, fileName, fileSize }}
        />
      ) : null}
    </>
  );
}

/** Toasts for a navigate-mode download of one object. */
export function ObjectDownloadToasts({
  download,
  objectKey,
  fileName,
  fileSize,
}: {
  download: UseNavigateDownloadReturn;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
}) {
  useDownloadToast(download, { objectKey, fileName, fileSize });
  return null;
}

type DeleteTarget = {
  objectKey: string;
  fileName?: string;
  fileSize?: number | null;
};

/**
 * Confirmation and toasts for `remove.requestDelete(target.objectKey)`.
 * Pass `null` when the target is not known yet.
 */
export function ObjectDeleteDialog({
  remove,
  target,
}: {
  remove: UseDeleteReturn;
  target: DeleteTarget | null;
}) {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const open =
    remove.isConfirming &&
    target != null &&
    remove.objectKey === target.objectKey;
  // Keep the text while the dialog animates out.
  const [shown, setShown] = useState<DeleteTarget | null>(null);
  if (open && target.objectKey !== shown?.objectKey) setShown(target);
  const current = open ? target : shown;
  const displayName = displayNameOf(current);
  useDeleteToast(remove, {
    objectKey: target?.objectKey ?? "",
    displayName: displayNameOf(target),
  });

  const name = isolateText(truncateFileName(displayName));
  const fileLabel =
    current?.fileSize != null
      ? `${name} (${isolateText(formatFileSize(current.fileSize))})`
      : name;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) remove.cancelDelete();
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
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {t(
              'Are you sure you want to delete "{name}"? This action cannot be undone.',
              {
                note: "dialog description",
                variables: { name: fileLabel },
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

function displayNameOf(target: DeleteTarget | null): string {
  if (!target) return "";
  return (
    target.fileName ?? fileNameFromKey(target.objectKey) ?? target.objectKey
  );
}

/**
 * Fires `onDeleted` when this file's delete reaches `success`.
 * Bulk delete leaves `objectKey` empty, so it does not match a file.
 */
function useFileDeleted(
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
