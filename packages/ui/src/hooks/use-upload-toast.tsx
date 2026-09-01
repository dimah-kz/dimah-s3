"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { formatFileSize } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError, type UseUploadReturn } from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

function sizeNode(size: number) {
  return (
    <span dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
      {formatFileSize(size)}
    </span>
  );
}

function progressNode(loaded: number, total: number) {
  return (
    <span dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
      {formatFileSize(loaded)} / {formatFileSize(total)}
    </span>
  );
}

/**
 * Drives toasts for upload progress/success/error.
 * Shared between UploadButton and UploadDropzone.
 */
export function useUploadToast(upload: UseUploadReturn, enabled: boolean) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const toastIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(upload.phase);
  const cancelRef = useRef(upload.cancel);
  useLayoutEffect(() => {
    cancelRef.current = upload.cancel;
  });

  const { phase, file, files, progress, error } = upload;

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (!enabled) return;

    const isMulti = files.length > 1;
    const total = progress.total;

    if (phase === "idle" && toastIdRef.current) {
      toast.close(toastIdRef.current);
      toastIdRef.current = null;
    }
    if (phase === "success") {
      if (toastIdRef.current) toast.close(toastIdRef.current);
      if (isMulti) {
        toast.add({
          type: "success",
          title: t("{count} file(s) uploaded", {
            note: "toast",
            variables: { count: String(files.length) },
          }),
          description: sizeNode(total),
        });
      } else if (file) {
        toast.add({
          type: "success",
          title: t("Upload complete", { note: "toast" }),
          description: sizeNode(file.size),
        });
      }
      toastIdRef.current = null;
    }
    if (phase === "error") {
      if (toastIdRef.current) toast.close(toastIdRef.current);
      if (isMulti && files.length > 0) {
        const succeeded = files.filter((f) => f.status === "success").length;
        const failed = files.filter((f) => f.status === "error").length;
        toast.add({
          type: "error",
          title: t("Upload finished with errors", { note: "toast" }),
          description: (
            <span
              dir="ltr"
              className="inline-block whitespace-nowrap tabular-nums"
            >
              {t("{succeeded} succeeded, {failed} failed", {
                note: "toast",
                variables: {
                  succeeded: String(succeeded),
                  failed: String(failed),
                },
              })}
            </span>
          ),
        });
      } else {
        toast.add({
          type: "error",
          title: t("Upload failed", { note: "toast" }),
          description: (
            <span dir="auto" className="block [overflow-wrap:anywhere]">
              {error
                ? formatError(error)
                : file?.error
                  ? formatError(file.error)
                  : t("Unknown error", { note: "fallback" })}
            </span>
          ),
        });
      }
      toastIdRef.current = null;
    }
  }, [enabled, phase, file, files, progress, error, t, formatError]);

  useEffect(() => {
    if (!enabled || phase !== "uploading") return;

    const isMulti = files.length > 1;
    const singleProgress = file?.progress ?? progress;

    const payload = isMulti
      ? {
          type: "loading" as const,
          timeout: 0,
          title: t("Uploading {done}/{total}", {
            note: "toast",
            variables: {
              done: String(files.filter((f) => f.status === "success").length),
              total: String(files.length),
            },
          }),
          description: progressNode(progress.loaded, progress.total),
          actionProps: {
            children: t("Cancel", { note: "toast action" }),
            onClick: () => cancelRef.current(),
          },
        }
      : file
        ? {
            type: "loading" as const,
            timeout: 0,
            title: t("Uploading", { note: "toast" }),
            description: progressNode(singleProgress.loaded, file.size),
            actionProps: {
              children: t("Cancel", { note: "toast action" }),
              onClick: () => cancelRef.current(),
            },
          }
        : null;

    if (!payload) return;

    if (toastIdRef.current) {
      toast.update(toastIdRef.current, payload);
    } else {
      toastIdRef.current = toast.add(payload);
    }
  }, [enabled, phase, file, files, progress, t]);
}
