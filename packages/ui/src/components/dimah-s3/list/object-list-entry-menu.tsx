"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { objectKeyOf } from "@dimah-s3/react/engine";
import {
  useFormatError,
  type AnyDownloadReturn,
  type DownloadOutcome,
  type UseDownloadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import {
  CloudUpload,
  DownloadIcon,
  FolderInputIcon,
  FolderOpenIcon,
  LinkIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  PencilIcon,
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
  useOptionalObjectListEntryScope,
} from "@/components/dimah-s3/list/object-list-context";
import { useObjectListDeleteRequest } from "@/components/dimah-s3/list/object-list-delete";
import { useObjectListFeedback } from "@/components/dimah-s3/list/object-list-feedback";
import { useShareExpiryLabel } from "@/hooks/use-share-expiry-label";
import { folderUploadCall } from "@/lib/folder-upload";

/** One extra row in {@link ObjectListEntryMenu}. */
export type ObjectListEntryMenuAction = {
  /** Row label. */
  label: string;
  onClick: () => void;
  /** Icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Destructive color. Stays above Delete, in its own group. */
  destructive?: boolean;
};

/** Props for {@link ObjectListEntryMenu}. */
export type ObjectListEntryMenuProps = {
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
   * `useDownload` return used only for Copy link. Defaults to the list's
   * `share`, then to the list's `download` when it is a `useDownload`
   * return. Pass one with `{ disposition: "inline" }` when the link should
   * open in a browser while Download stays an attachment.
   */
  share?: UseDownloadReturn;
  /**
   * Requested TTL in seconds for the copied link.
   * The server signs the shorter of this value and the route cap.
   * The toast shows the TTL that was actually signed.
   */
  expiresIn?: number;
  /**
   * Extra rows, after Copy link and Rename, and before Delete.
   * Use this for actions the menu does not provide.
   */
  actions?: readonly ObjectListEntryMenuAction[];
  /** More rows, after `actions`: {@link ObjectListEntryMenuItem}s. */
  children?: ReactNode;
  /** Classes on the trigger button. */
  className?: string;
};

/**
 * Overflow menu for one entry.
 *
 * - Files: Download, Copy link, Rename when the source has `renameFile`,
 *   Move to when it has `moveFile`, your actions, Delete.
 * - Folders: Upload to this folder (the keyboard path to a folder drop),
 *   Rename when the source has `renameFolder`, Move to when it has
 *   `moveFolder`, your actions, then Delete when the list has `delete` and
 *   the source has `deleteFolder`. Upload is disabled while the list's
 *   `upload` is.
 * - Search results that know where they live start with Show in folder,
 *   which leaves the search, opens that folder, and focuses the entry.
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
export function ObjectListEntryMenu({
  objectKey: objectKeyProp,
  fileName: fileNameProp,
  fileSize: fileSizeProp,
  share: shareProp,
  expiresIn,
  actions,
  children,
  className,
}: ObjectListEntryMenuProps) {
  const t = useTranslations();
  // Inside a list the trigger reads the list's features only, so upload
  // progress does not draw every row's menu. The items read the hooks.
  const scope = useOptionalObjectListEntryScope();
  const entry = useObjectListEntry();
  const entryKey = entry?.key ?? null;
  const menuStore = scope?.store;
  const menuOpen = useSyncExternalStore(
    menuStore?.subscribe ?? subscribeNothing,
    () => entryKey != null && menuStore?.get().menu === entryKey,
    () => false,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const file = entry?.kind === "file" ? entry : null;
  const folder = entry?.kind === "folder" ? entry : null;
  const objectKey = objectKeyProp ?? (file ? objectKeyOf(file) : "");
  const isFile = objectKey !== "";
  const rows: MenuRows = {
    reveal: entry?.location != null && Boolean(scope?.search),
    // A folder takes uploads only when the source can place files in it.
    upload: folder != null && scope?.folderUploads === true,
    download: isFile && scope?.download === true,
    link: isFile && (shareProp != null || scope?.share === true),
    rename:
      entry != null &&
      (entry.kind === "file" ? scope?.renameFile : scope?.renameFolder) ===
        true,
    move:
      entry != null &&
      (entry.kind === "file" ? scope?.moveFile : scope?.moveFolder) === true,
    extra: (actions?.length ?? 0) > 0 || children != null,
    delete: folder
      ? scope?.deleteFolder === true
      : isFile && scope?.delete === true,
  };
  if (!isFile && !folder) return null;
  if (!Object.values(rows).some(Boolean)) return null;

  // The name tells one row's button from the next, as the checkbox does.
  const name = entry?.name ?? fileNameProp;
  const menuLabel =
    name != null
      ? t("Actions for {name}", {
          note: "object list menu",
          variables: { name },
        })
      : folder
        ? t("Folder actions", { note: "object list menu" })
        : t("File actions", { note: "object list menu" });

  const inRow = entryKey != null && menuStore != null;
  return (
    <DropdownMenu
      open={inRow ? menuOpen : undefined}
      onOpenChange={
        inRow
          ? (open) => menuStore.set({ menu: open ? entryKey : null })
          : undefined
      }
    >
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            data-slot="object-list-entry-menu"
            // In an entry, Tab and the arrow keys from the entry reach it.
            tabIndex={entry ? -1 : undefined}
            className={className}
          />
        }
      >
        <MoreHorizontalIcon />
        <span className="sr-only">{menuLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <ItemMenuItems
          rows={rows}
          folderId={folder?.id ?? null}
          entryKey={entry?.key ?? null}
          objectKey={objectKey}
          fileName={fileNameProp ?? file?.file.name}
          fileSize={fileSizeProp ?? file?.file.size}
          share={shareProp}
          expiresIn={expiresIn}
          actions={actions}
          triggerRef={triggerRef}
        >
          {children}
        </ItemMenuItems>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function subscribeNothing() {
  return () => {};
}

/** Props for {@link ObjectListEntryMenuItem}. */
export type ObjectListEntryMenuItemProps = {
  onClick?: () => void;
  disabled?: boolean;
  /** Destructive color, as Delete has. */
  destructive?: boolean;
  className?: string;
  /** An icon, then the label. */
  children?: ReactNode;
};

/**
 * One row for the `children` of {@link ObjectListEntryMenu}, when `actions`
 * is not enough, such as a row that reads state of its own.
 *
 * @example
 * ```tsx
 * <ObjectListEntryMenu>
 *   <ObjectListEntryMenuItem onClick={() => star(entry)}>
 *     <StarIcon />
 *     Star
 *   </ObjectListEntryMenuItem>
 * </ObjectListEntryMenu>
 * ```
 */
export function ObjectListEntryMenuItem({
  onClick,
  disabled,
  destructive = false,
  className,
  children,
}: ObjectListEntryMenuItemProps) {
  return (
    <DropdownMenuItem
      data-slot="object-list-entry-menu-item"
      variant={destructive ? "destructive" : "default"}
      disabled={disabled}
      className={className}
      onClick={onClick}
    >
      {children}
    </DropdownMenuItem>
  );
}

/** Which rows {@link ObjectListEntryMenu} has. */
type MenuRows = {
  reveal: boolean;
  upload: boolean;
  download: boolean;
  link: boolean;
  rename: boolean;
  move: boolean;
  extra: boolean;
  delete: boolean;
};

/** The menu's rows, drawn while it is open. */
function ItemMenuItems({
  rows,
  folderId,
  entryKey,
  objectKey,
  fileName,
  fileSize,
  share: shareProp,
  expiresIn,
  actions,
  triggerRef,
  children,
}: {
  rows: MenuRows;
  folderId: string | null;
  entryKey: string | null;
  objectKey: string;
  fileName: string | undefined;
  fileSize: number | null | undefined;
  share: UseDownloadReturn | undefined;
  expiresIn: number | undefined;
  actions: readonly ObjectListEntryMenuAction[] | undefined;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const t = useTranslations();
  const context = useOptionalObjectListContext();
  const download = rows.download ? (context?.download ?? null) : null;
  const linkSource = rows.link
    ? (shareProp ??
      context?.share ??
      (context?.download?.kind === "navigate" ? context.download : null))
    : null;
  const remove = rows.delete ? (context?.delete ?? null) : null;
  const listUpload = context?.upload ?? null;
  const folderCall =
    rows.upload && context && folderId != null
      ? folderUploadCall(context.list, folderId)
      : undefined;
  const uploadToFolder =
    listUpload && folderCall ? () => listUpload.open(folderCall) : null;

  const extra = actions ?? [];
  const showTransfer = download != null || linkSource != null;
  const showExtra = rows.extra;
  const canRename = rows.rename && context != null && entryKey != null;
  const entry = useObjectListEntry();
  const reveal =
    rows.reveal && context != null && entry != null
      ? () => context.revealEntry(entry)
      : null;
  const canMove = rows.move && context != null && entry != null;
  const showMain =
    uploadToFolder != null || showTransfer || canRename || canMove;

  return (
    <>
      {reveal ? (
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={reveal}>
            <FolderOpenIcon />
            {t("Show in folder", { note: "object list menu" })}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      ) : null}
      {reveal && (showMain || showExtra || rows.delete) ? (
        <DropdownMenuSeparator />
      ) : null}
      {showMain ? (
        <DropdownMenuGroup>
          {uploadToFolder ? (
            <DropdownMenuItem
              disabled={listUpload?.disabled}
              onClick={uploadToFolder}
            >
              <CloudUpload />
              {t("Upload to this folder", { note: "object list menu" })}
            </DropdownMenuItem>
          ) : null}
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
          {canRename ? (
            <DropdownMenuItem
              onClick={() => {
                if (entryKey != null) context?.startRename(entryKey);
              }}
            >
              <PencilIcon />
              {t("Rename", { note: "object list menu" })}
            </DropdownMenuItem>
          ) : null}
          {canMove ? (
            <DropdownMenuItem
              onClick={() => {
                if (entry) {
                  context?.startMove([entry], { trigger: triggerRef.current });
                }
              }}
            >
              <FolderInputIcon />
              {t("Move to…", { note: "object list menu" })}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      ) : null}
      {showExtra && showMain ? <DropdownMenuSeparator /> : null}
      {showExtra ? (
        <DropdownMenuGroup>
          {extra.map((action, index) => (
            <DropdownMenuItem
              key={`${action.label}-${index}`}
              variant={action.destructive ? "destructive" : "default"}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
          {children}
        </DropdownMenuGroup>
      ) : null}
      {remove && (showMain || showExtra) ? <DropdownMenuSeparator /> : null}
      {remove ? (
        <DropdownMenuGroup>
          {entry?.kind === "folder" ? (
            <FolderDeleteItem triggerRef={triggerRef} />
          ) : (
            <DeleteItem
              objectKey={objectKey}
              fileName={fileName}
              fileSize={fileSize}
              triggerRef={triggerRef}
            />
          )}
        </DropdownMenuGroup>
      ) : null}
    </>
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
        if (download.kind === "fetch") {
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
  const formatError = useFormatError();
  const expiryLabel = useShareExpiryLabel();
  const report = useObjectListFeedback();
  const [copying, setCopying] = useState(false);

  async function copyLink() {
    if (copying) return;
    setCopying(true);
    const signing = share.presign(objectKey, {
      fileName,
      ...(expiresIn != null ? { expiresIn } : {}),
    });
    // Started now, inside the click, and given its text once the URL is
    // signed. A rejection is read below, after a signed URL only.
    const written = writeLink(signing);
    written.catch(() => undefined);
    try {
      const outcome = await signing;
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
        await written;
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
 * Writes the URL `signing` resolves with to the clipboard. Rejects when
 * nothing was written.
 *
 * Safari only lets a page write to the clipboard during the click itself,
 * and signing takes a request. A `ClipboardItem` takes a promise, so the
 * write starts at once and gets its text when the URL is signed. Browsers
 * without `ClipboardItem`, or that refuse the item, get `writeText` once
 * the URL is there.
 */
async function writeLink(signing: Promise<DownloadOutcome>): Promise<void> {
  const url = signing.then((outcome) => {
    if (outcome.status !== "success") throw new Error("No link to copy.");
    return outcome.data.url;
  });
  const { clipboard } = navigator;
  if (typeof ClipboardItem === "function" && clipboard.write != null) {
    try {
      await clipboard.write([
        new ClipboardItem({
          "text/plain": url.then(
            (text) => new Blob([text], { type: "text/plain" }),
          ),
        }),
      ]);
      return;
    } catch {
      // Try plain text below.
    }
  }
  await clipboard.writeText(await url);
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
  const deleting = del.pendingKeys.includes(objectKey);

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

/**
 * Asks the list to delete the folder of this row, with everything in it.
 * Focus returns to the menu trigger, or to the list once the row is gone.
 */
function FolderDeleteItem({
  triggerRef,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations();
  const entry = useObjectListEntry();
  const requestDelete = useObjectListDeleteRequest();
  const { isDeleting } = useDeleteContext();
  if (!entry || !requestDelete) return null;

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={isDeleting}
      onClick={() => requestDelete([entry], { trigger: triggerRef.current })}
    >
      <Trash2Icon />
      {t("Delete", { note: "button" })}
    </DropdownMenuItem>
  );
}
