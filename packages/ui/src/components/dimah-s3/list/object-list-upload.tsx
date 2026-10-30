"use client";

import { useEffect, useRef } from "react";
import type { UseUploadReturn } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import { useUploadUi } from "@/hooks/use-upload-ui";

/**
 * Reloads the list once when an upload batch settles with at least one success.
 * Call it from the list root, outside the folder key, so opening another
 * folder does not reload again.
 */
export function useRefreshListAfterUpload(
  upload: UseUploadReturn | undefined,
  refresh: (() => void | Promise<void>) | undefined,
) {
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef(refresh);
  const successIds =
    upload?.files
      .filter((file) => file.status === "success")
      .map((file) => file.id)
      .join("\0") ?? "";
  const settled =
    upload != null && !upload.isPending && upload.phase !== "idle";

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!settled) {
      tokenRef.current = null;
      return;
    }
    if (!successIds) return;
    if (tokenRef.current === successIds) return;
    tokenRef.current = successIds;
    void refreshRef.current?.();
  }, [settled, successIds]);
}

/**
 * Progress and errors for the list's `upload`, under the header.
 * Hidden while idle and after a batch that fully succeeded.
 */
export function ObjectListUploadStatus({ className }: { className?: string }) {
  const { upload } = useObjectListContext();
  if (!upload) return null;
  return <UploadStatusStrip upload={upload} className={className} />;
}

function UploadStatusStrip({
  upload,
  className,
}: {
  upload: UseUploadReturn;
  className?: string;
}) {
  const { statusNode } = useUploadUi(upload);
  if (upload.phase === "idle" || upload.phase === "success") return null;
  return (
    <div
      data-slot="object-list-upload-status"
      className={cn(
        "shrink-0 border-b border-dimah-s3-border px-3 py-2",
        className,
      )}
    >
      {statusNode}
    </div>
  );
}

export function ObjectListDropOverlay({ upload }: { upload: UseUploadReturn }) {
  const t = useTranslations();
  const dropLabel = upload.isDragReject
    ? t("These files cannot be uploaded", { note: "object list" })
    : t("Drop to upload into this folder", { note: "object list" });

  return (
    <>
      {upload.isDragActive ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-dimah-s3-card/80 p-6"
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
        {upload.isDragActive ? dropLabel : ""}
      </div>
    </>
  );
}
