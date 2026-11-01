"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "@fuma-translate/react";
import {
  useFormatDimahError,
  useFormatFileSize,
  useFormatNumber,
} from "@dimah-s3/react";
import type { UploadFileState, UseUploadReturn } from "@dimah-s3/react";
import { toast } from "@/components/ui/toast";
import { useToastOwner } from "@/hooks/use-toast-owner";

/** Props for {@link UploadToasts}. */
export type UploadToastsProps = {
  /** The `useUpload` return to report on. */
  upload: UseUploadReturn;
};

/**
 * Toasts for a `useUpload` hook: progress with a cancel action while files
 * upload, the result once they settle, and the files it rejected. Mount it
 * once per hook, next to one `<Toaster />`. It renders nothing.
 *
 * Only one owner reports per hook: a second `UploadToasts` for the same
 * hook stays silent and warns in development, and the `ObjectList`
 * built-in toasts step aside for it. Its progress toast closes when it
 * unmounts.
 */
export function UploadToasts({ upload }: UploadToastsProps) {
  const active = useToastOwner(upload.instanceId);
  return active ? <ActiveUploadToasts upload={upload} /> : null;
}

/**
 * Weak owner for `ObjectList`: it shows the same toasts only while no
 * {@link UploadToasts} is mounted for the hook. @internal
 */
export function BuiltInUploadToasts({ upload }: UploadToastsProps) {
  const active = useToastOwner(upload.instanceId, { weak: true });
  return active ? <ActiveUploadToasts upload={upload} /> : null;
}

/** Isolated so localized digits and units keep their own order. */
function numbers(text: string) {
  return (
    <bdi className="inline-block whitespace-nowrap tabular-nums">{text}</bdi>
  );
}

function isSettled(file: UploadFileState) {
  return file.phase === "success" || file.phase === "error";
}

function ActiveUploadToasts({ upload }: UploadToastsProps) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const { files, isPending, progress, fileRejections } = upload;
  const showProgress = isPending && files.length > 0;

  const progressToastRef = useRef<string | null>(null);
  const cancelRef = useRef(upload.cancel);
  // Results and rejections from before this owner mounted are not reported.
  const [reported] = useState(
    () => new Set(files.filter(isSettled).map((file) => file.id)),
  );
  const rejectionsRef = useRef(fileRejections);

  useEffect(() => {
    cancelRef.current = upload.cancel;
  });

  useEffect(
    () => () => {
      if (progressToastRef.current) toast.close(progressToastRef.current);
      progressToastRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!showProgress) {
      if (progressToastRef.current) toast.close(progressToastRef.current);
      progressToastRef.current = null;
      return;
    }
    const done = files.filter((file) => file.phase === "success").length;
    const payload = {
      type: "loading",
      timeout: 0,
      title:
        files.length > 1
          ? t("Uploading {done}/{total}", {
              note: "toast",
              variables: {
                done: formatNumber(done),
                total: formatNumber(files.length),
              },
            })
          : t("Uploading", { note: "toast" }),
      description: numbers(
        `${formatFileSize(progress.loaded)} / ${formatFileSize(progress.total)}`,
      ),
      actionProps: {
        children: t("Cancel", { note: "toast action" }),
        onClick: () => cancelRef.current(),
      },
    };
    if (progressToastRef.current) {
      toast.update(progressToastRef.current, payload);
    } else {
      progressToastRef.current = toast.add(payload);
    }
  }, [showProgress, files, progress, t, formatFileSize, formatNumber]);

  useEffect(() => {
    if (isPending) return;
    const fresh = files.filter(
      (file) => isSettled(file) && !reported.has(file.id),
    );
    if (fresh.length === 0) return;
    for (const file of fresh) reported.add(file.id);

    const failed = fresh.filter((file) => file.phase === "error");
    const [first] = fresh;
    if (fresh.length === 1) {
      toast.add(
        failed.length === 0
          ? {
              type: "success",
              title: t("Upload complete", { note: "toast" }),
              description: numbers(formatFileSize(first.fileSize)),
            }
          : {
              type: "error",
              title: t("Upload failed", { note: "toast" }),
              description: wrapText(formatError(first.error)),
            },
      );
      return;
    }
    toast.add(
      failed.length === 0
        ? {
            type: "success",
            title: t("{count} files uploaded", {
              note: "toast",
              variables: { count: formatNumber(fresh.length) },
            }),
            description: numbers(
              formatFileSize(
                fresh.reduce((total, file) => total + file.fileSize, 0),
              ),
            ),
          }
        : {
            type: "error",
            title: t("Upload finished with errors", { note: "toast" }),
            description: (
              <span className="tabular-nums">
                {t("{succeeded} succeeded, {failed} failed", {
                  note: "toast",
                  variables: {
                    succeeded: formatNumber(fresh.length - failed.length),
                    failed: formatNumber(failed.length),
                  },
                })}
              </span>
            ),
          },
    );
  }, [
    isPending,
    files,
    reported,
    t,
    formatError,
    formatFileSize,
    formatNumber,
  ]);

  useEffect(() => {
    if (fileRejections === rejectionsRef.current) return;
    rejectionsRef.current = fileRejections;
    if (fileRejections.length === 0) return;

    const reasons = new Set(
      fileRejections.map(({ errors }) => formatError(errors[0])),
    );
    const [reason] = reasons;
    const [first] = fileRejections;
    toast.add(
      fileRejections.length === 1
        ? {
            type: "error",
            title: t("File not accepted", { note: "toast" }),
            description: wrapText(
              <>
                <bdi>{first.file.name}</bdi>: {reason}
              </>,
            ),
          }
        : {
            type: "error",
            title: t("{count} files were rejected", {
              note: "toast",
              variables: { count: formatNumber(fileRejections.length) },
            }),
            // One shared reason is worth showing; a mix of reasons is not.
            description: reasons.size === 1 ? wrapText(reason) : undefined,
          },
    );
  }, [fileRejections, t, formatError, formatNumber]);

  return null;
}

/** Lets long file names and messages wrap inside the toast. */
function wrapText(content: ReactNode) {
  return <span className="block [overflow-wrap:anywhere]">{content}</span>;
}
