"use client";

import { useEffect, useRef } from "react";
import {
  useFormatError,
  useFormatFileSize,
  type AnyDownloadReturn,
  type DownloadOperation,
  type FetchDownloadOperation,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { toast } from "@/components/ui/toast";
import { useToastOwner } from "@/hooks/use-toast-owner";
import { ToastFile } from "@/lib/toast-content";
import {
  downloadDisplayName,
  isDownloadRunning,
  useFormatDownloadedBytes,
} from "@/components/dimah-s3/download/download";

/** Props for {@link DownloadToasts}. */
export type DownloadToastsProps = {
  /** A `useDownload` or `useFetchDownload` return. */
  download: AnyDownloadReturn;
};

/**
 * Shows toasts for every call of one download hook. Mount it once per hook,
 * next to one `<Toaster />`. It renders no element of its own.
 *
 * - `useDownload`: "Download started" once the browser has the URL.
 * - `useFetchDownload`: a "Downloading" toast with the bytes received and a
 *   Cancel action, then "Download complete".
 * - Both: "Download failed" with the error, and "Download cancelled".
 *
 * A second `DownloadToasts` for the same hook renders nothing and warns in
 * development. Calls that settled before it mounted are not announced.
 */
export function DownloadToasts({ download }: DownloadToastsProps) {
  const active = useToastOwner(download.instanceId);
  return active ? <ActiveDownloadToasts download={download} /> : null;
}

/**
 * Weak owner for `ObjectList`: it shows the same toasts only while no
 * {@link DownloadToasts} is mounted for the hook. @internal
 */
export function BuiltInDownloadToasts({ download }: DownloadToastsProps) {
  const active = useToastOwner(download.instanceId, { weak: true });
  return active ? <ActiveDownloadToasts download={download} /> : null;
}

type AnyDownloadOperation = DownloadOperation | FetchDownloadOperation;

function isFetchOperation(
  operation: AnyDownloadOperation,
): operation is FetchDownloadOperation {
  return "progress" in operation;
}

/** Toasts of the active owner. Mounting it takes over; unmounting hands over. */
function ActiveDownloadToasts({ download }: DownloadToastsProps) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatFileSize = useFormatFileSize();
  const formatDownloadedBytes = useFormatDownloadedBytes();
  const { operations, cancel } = download;
  /** Settled operations already announced, or settled before this owner took over. */
  const announced = useRef<Set<string>>(null);
  /** Open "Downloading" toast per running operation id. */
  const loading = useRef(new Map<string, string>());

  useEffect(() => {
    announced.current ??= new Set(
      operations.filter((op) => !isDownloadRunning(op)).map((op) => op.id),
    );
    const done = announced.current;
    const open = loading.current;
    const current = new Set(operations.map((op) => op.id));

    const describe = (
      operation: AnyDownloadOperation,
      detail?: string | null,
      error?: string,
    ) => (
      <ToastFile
        name={downloadDisplayName(operation)}
        detail={detail}
        error={error}
      />
    );

    const showProgress = (operation: FetchDownloadOperation) => {
      const options = {
        type: "loading",
        timeout: 0,
        title: t("Downloading", { note: "toast" }),
        description: describe(
          operation,
          formatDownloadedBytes(operation.progress),
        ),
        actionProps: {
          children: t("Cancel", { note: "toast action" }),
          onClick: () => cancel(operation.key),
        },
      };
      const id = open.get(operation.id);
      if (id) toast.update(id, options);
      else open.set(operation.id, toast.add(options));
    };

    const announce = (operation: AnyDownloadOperation) => {
      switch (operation.phase) {
        case "success":
          toast.add(
            isFetchOperation(operation)
              ? {
                  type: "success",
                  title: t("Download complete", { note: "toast" }),
                  description: describe(
                    operation,
                    operation.fileSize == null
                      ? undefined
                      : formatFileSize(operation.fileSize),
                  ),
                }
              : {
                  type: "success",
                  title: t("Download started", { note: "toast" }),
                  description: describe(operation),
                },
          );
          return;
        case "error":
          toast.add({
            type: "error",
            title: t("Download failed", { note: "toast" }),
            description: describe(
              operation,
              null,
              formatError(operation.error),
            ),
          });
          return;
        case "aborted":
          toast.add({
            type: "info",
            title: t("Download cancelled", { note: "toast" }),
            description: describe(operation),
          });
          return;
        case "presigning":
        case "downloading":
          // Running operations are shown by `showProgress`.
          return;
      }
    };

    for (const operation of operations) {
      if (isDownloadRunning(operation)) {
        if (isFetchOperation(operation)) showProgress(operation);
        continue;
      }
      if (done.has(operation.id)) continue;
      done.add(operation.id);
      const id = open.get(operation.id);
      if (id) {
        toast.close(id);
        open.delete(operation.id);
      }
      announce(operation);
    }

    // Operations that `reset` removed.
    for (const [operationId, id] of open) {
      if (current.has(operationId)) continue;
      toast.close(id);
      open.delete(operationId);
    }
    for (const operationId of done) {
      if (!current.has(operationId)) done.delete(operationId);
    }
  }, [
    operations,
    cancel,
    t,
    formatError,
    formatFileSize,
    formatDownloadedBytes,
  ]);

  // Close the open "Downloading" toasts when this owner unmounts or hands over.
  useEffect(() => {
    const open = loading.current;
    return () => {
      for (const id of open.values()) toast.close(id);
      open.clear();
    };
  }, []);

  return null;
}
