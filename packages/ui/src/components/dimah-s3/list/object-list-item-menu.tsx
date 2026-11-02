"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import {
  useFormatDimahError,
  type AnyDownloadReturn,
  type UseDownloadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  CloudUpload,
  DownloadIcon,
  LinkIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteContext } from "@/components/dimah-s3/delete/delete";
import {
  useObjectListEntry,
  useOptionalObjectListContext,
} from "@/components/dimah-s3/list/object-list-context";
import { useObjectListFeedback } from "@/components/dimah-s3/list/object-list-feedback";
import { folderUploadCall } from "@/components/dimah-s3/list/object-list-upload";
import { useShareExpiryLabel } from "@/lib/format-expires-in";

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
   * S3 object key. Inside an `ObjectList` file row it defaults to the
   * entry's `objectKey`. Named `objectKey` because React reserves `key`.
   */
  objectKey?: string;
  /** Download filename and confirmation label. Defaults to the entry name. */
  fileName?: string;
  /** Shown in the delete confirmation. Defaults to the entry size. */
  fileSize?: number | null;
  /**
   * Navigate-mode `useDownload` used only for Copy link. Defaults to the
   * list's `share`, then to a navigate-mode list `download`. Pass one with
   * `{ disposition: "inline" }` when the link should open in a browser
   * while Download stays an attachment.
   */
  share?: UseDownloadReturn;
  /**
   * Requested TTL in seconds for the copied link.
   * The server signs the shorter of this value and the route cap.
   * The toast shows the TTL that was actually signed.
   */
  expiresIn?: number;
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
 * Overflow menu for one entry.
 *
 * - Files: Download, Copy link, your actions, Delete.
 * - Folders: Upload to this folder (the keyboard path to a folder drop),
 *   then your actions. It is disabled while the list's `upload` is.
 *
 * Inside an `ObjectList` every prop is optional: the key, name, size, and
 * hooks come from the entry and the list. Download runs the list's
 * `download`, and Delete asks the list's delete root, which owns the
 * confirmation. Outside a list the menu has Copy link (with `share`) and
 * your own rows.
 *
 * Copy link signs one URL and writes it to the clipboard. Signing does not
 * start a download.
 */
export function ObjectListItemMenu({
  objectKey: objectKeyProp,
  fileName: fileNameProp,
  fileSize: fileSizeProp,
  share: shareProp,
  expiresIn,
  actions,
  children,
  className,
}: ObjectListItemMenuProps) {
  const t = useTranslations();
  const context = useOptionalObjectListContext();
  const entry = useObjectListEntry();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const file = entry?.kind === "file" ? entry : null;
  const folder = entry?.kind === "folder" ? entry : null;
  const objectKey = objectKeyProp ?? (file ? objectKeyOf(file) : "");
  const fileName = fileNameProp ?? file?.file.name;
  const fileSize = fileSizeProp ?? file?.file.size;
  const isFile = objectKey !== "";

  const download = isFile ? (context?.download ?? null) : null;
  const linkSource = isFile
    ? (shareProp ??
      context?.share ??
      (download?.mode === "navigate" ? download : null))
    : null;
  const remove = isFile ? (context?.delete ?? null) : null;
  const listUpload = context?.upload ?? null;
  // A folder takes uploads only when the source can place files in it.
  const folderCall =
    folder && listUpload && context
      ? folderUploadCall(context.list, folder.id)
      : undefined;
  const uploadToFolder =
    listUpload && folderCall ? () => listUpload.open(folderCall) : null;

  const extra = actions ?? [];
  const showTransfer = download != null || linkSource != null;
  const showExtra = extra.length > 0 || children != null;
  if (!isFile && !folder) return null;
  if (!showTransfer && !showExtra && !uploadToFolder && remove == null) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            data-slot="object-list-item-menu"
            className={className}
          />
        }
      >
        <MoreHorizontalIcon />
        <span className="sr-only">
          {folder
            ? t("Folder actions", { note: "object list menu" })
            : t("File actions", { note: "object list menu" })}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {uploadToFolder ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={listUpload?.disabled}
              onClick={uploadToFolder}
            >
              <CloudUpload />
              {t("Upload to this folder", { note: "object list menu" })}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
        {showTransfer ? (
          <DropdownMenuGroup>
            {download ? (
              <DownloadItem
                download={download}
                objectKey={objectKey}
                fileName={fileName}
                fileSize={fileSize}
              />
            ) : null}
            {linkSource ? (
              <CopyLinkItem
                share={linkSource}
                objectKey={objectKey}
                fileName={fileName}
                expiresIn={expiresIn}
              />
            ) : null}
          </DropdownMenuGroup>
        ) : null}
        {showExtra && (showTransfer || uploadToFolder) ? (
          <DropdownMenuSeparator />
        ) : null}
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
            <DeleteItem
              objectKey={objectKey}
              fileName={fileName}
              fileSize={fileSize}
              triggerRef={triggerRef}
            />
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Downloads one key with the list's hook. Busy only while that key runs. */
function DownloadItem({
  download,
  objectKey,
  fileName,
  fileSize,
}: {
  download: AnyDownloadReturn;
  objectKey: string;
  fileName: string | undefined;
  fileSize: number | null | undefined;
}) {
  const t = useTranslations();
  const pending = download.pendingKeys.includes(objectKey);

  return (
    <DropdownMenuItem
      disabled={pending}
      onClick={() => {
        if (download.mode === "fetch") {
          void download.download(objectKey, { fileName, fileSize });
        } else {
          void download.download(objectKey, { fileName });
        }
      }}
    >
      {pending ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
      {t("Download", { note: "button" })}
    </DropdownMenuItem>
  );
}

/**
 * Signs one URL for the key and copies it. Reports the result in a toast,
 * or in the list's live region when its toasts are off.
 */
function CopyLinkItem({
  share,
  objectKey,
  fileName,
  expiresIn,
}: {
  share: UseDownloadReturn;
  objectKey: string;
  fileName: string | undefined;
  expiresIn: number | undefined;
}) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const expiryLabel = useShareExpiryLabel();
  const report = useObjectListFeedback();
  const [copying, setCopying] = useState(false);

  async function copyLink() {
    if (copying) return;
    setCopying(true);
    try {
      const outcome = await share.presign(objectKey, {
        fileName,
        ...(expiresIn != null ? { expiresIn } : {}),
      });
      if (outcome.status === "error") {
        report({
          type: "error",
          title: t("Could not create link", { note: "object list menu" }),
          description: (
            <span className="block [overflow-wrap:anywhere]">
              {formatError(outcome.error)}
            </span>
          ),
        });
        return;
      }
      if (outcome.status !== "success") return;
      const signed = outcome.data;
      try {
        await navigator.clipboard.writeText(signed.url);
      } catch {
        report({
          type: "error",
          title: t("Could not copy link", { note: "object list menu" }),
          description: (
            <span className="block [overflow-wrap:anywhere]">{signed.url}</span>
          ),
        });
        return;
      }
      report({
        type: "success",
        title: t("Link copied", { note: "object list menu" }),
        description: expiryLabel(
          signed.mode === "proxy" ? null : signed.expiresIn,
        ),
      });
    } finally {
      setCopying(false);
    }
  }

  return (
    <DropdownMenuItem disabled={copying} onClick={() => void copyLink()}>
      {copying ? <LoaderIcon className="animate-spin" /> : <LinkIcon />}
      {t("Copy link", { note: "object list menu" })}
    </DropdownMenuItem>
  );
}

/**
 * Asks the list's `Delete` root to delete one key. Focus returns to the
 * menu trigger, or to the list once the row is gone.
 */
function DeleteItem({
  objectKey,
  fileName,
  fileSize,
  triggerRef,
}: {
  objectKey: string;
  fileName: string | undefined;
  fileSize: number | null | undefined;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations();
  const { delete: del, request } = useDeleteContext();
  const deleting = del.get(objectKey)?.phase === "deleting";

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={deleting}
      onClick={() =>
        request(
          { objectKey, fileName, fileSize },
          { trigger: triggerRef.current },
        )
      }
    >
      {deleting ? <LoaderIcon className="animate-spin" /> : <Trash2Icon />}
      {t("Delete", { note: "button" })}
    </DropdownMenuItem>
  );
}
