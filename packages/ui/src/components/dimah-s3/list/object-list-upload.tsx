"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type {
  UploadCallOptions,
  UseObjectListReturn,
  UseUploadReturn,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { UploadStatus } from "@/components/dimah-s3/upload/upload-status";

/**
 * Call options for files uploaded into `parent` (`null` is the root): the
 * source's `uploadOptions` for that folder. `undefined` when the source has
 * none, so the hook's own options apply.
 */
export function folderUploadCall<TItem>(
  list: UseObjectListReturn<TItem>,
  parent: string | null,
): UploadCallOptions | undefined {
  return list.uploadOptions
    ? { uploadOptions: list.uploadOptions(parent) }
    : undefined;
}

/**
 * Reloads the list once each time the upload queue settles with new
 * successful files. Files that succeeded before mount do not count.
 * Call it from the list root, outside the folder key, so opening another
 * folder does not reload again.
 */
export function useRefreshListAfterUpload(
  upload: UseUploadReturn | undefined,
  refresh: () => void | Promise<void>,
) {
  const reload = useEffectEvent(() => {
    void refresh();
  });
  /** File ids already counted, or settled before mount. */
  const seenRef = useRef<Set<string> | null>(null);
  const files = upload?.files;
  const settled = upload != null && !upload.isPending;

  useEffect(() => {
    if (!files) return;
    const succeeded = files
      .filter((file) => file.phase === "success")
      .map((file) => file.id);
    seenRef.current ??= new Set(succeeded);
    const seen = seenRef.current;
    const listed = new Set(files.map((file) => file.id));
    for (const id of seen) {
      if (!listed.has(id)) seen.delete(id);
    }
    if (!settled) return;
    const fresh = succeeded.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.add(id);
    reload();
  }, [files, settled]);
}

/**
 * Progress and errors for the list's `upload`, under the header.
 * Hidden while idle and after a queue that fully succeeded.
 */
export function ObjectListUploadStatus({ className }: { className?: string }) {
  const { upload } = useObjectListContext();
  if (!upload || upload.phase === "idle" || upload.phase === "success") {
    return null;
  }
  return (
    <div
      data-slot="object-list-upload-status"
      className={cn(
        "shrink-0 border-b border-dimah-s3-border px-3 py-2",
        className,
      )}
    >
      <UploadStatus />
    </div>
  );
}

/**
 * Overlay and live message while files are dragged over the list.
 *
 * `active` is the frame's own drag state, so a drag over another drop
 * target of the same hook stays quiet. `target` is what takes the drag
 * inside the frame: over a folder row the overlay steps aside and the live
 * message names `folder`; over a dropzone both step aside, since the
 * dropzone shows and announces its own state.
 */
export function ObjectListDropOverlay({
  upload,
  active,
  target = "frame",
  folder = null,
}: {
  upload: UseUploadReturn;
  active: boolean;
  target?: "frame" | "folder" | "dropzone";
  folder?: string | null;
}) {
  const t = useTranslations();
  const shown = active && target === "frame";
  const dropLabel = upload.isDragReject
    ? t("These files cannot be uploaded", { note: "object list" })
    : t("Drop to upload into this folder", { note: "object list" });
  const message =
    !active || target === "dropzone"
      ? ""
      : target === "folder" && folder && !upload.isDragReject
        ? t("Drop to upload into {name}", {
            note: "object list",
            variables: { name: folder },
          })
        : dropLabel;

  return (
    <>
      {shown ? (
        <div
          aria-hidden
          data-slot="object-list-drop-overlay"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-dimah-s3-card/80 p-6 group-has-[[data-slot=object-list-entry][data-drag-active]]/object-list:hidden"
        >
          <p
            className={cn(
              "rounded-md border border-dashed px-3 py-2 text-sm",
              upload.isDragReject
                ? "border-dimah-s3-destructive text-dimah-s3-destructive"
                : "border-dimah-s3-primary text-dimah-s3-primary",
            )}
          >
            {dropLabel}
          </p>
        </div>
      ) : null}
      <div className="sr-only" aria-live="polite">
        {message}
      </div>
    </>
  );
}
