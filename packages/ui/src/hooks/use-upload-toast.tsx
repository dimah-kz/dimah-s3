"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "@fuma-translate/react";
import {
  useFormatDimahError,
  useFormatFileSize,
  useFormatNumber,
  type UseUploadReturn,
} from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

/** Isolated so localized digits and units keep their own order. */
function numbersNode(text: string) {
  return (
    <bdi className="inline-block whitespace-nowrap tabular-nums">{text}</bdi>
  );
}

/**
 * Drives toasts for upload progress/success/error.
 * Shared between UploadButton and UploadDropzone.
 */
export function useUploadToast(upload: UseUploadReturn, enabled: boolean) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
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
            variables: { count: formatNumber(files.length) },
          }),
          description: numbersNode(formatFileSize(total)),
        });
      } else if (file) {
        toast.add({
          type: "success",
          title: t("Upload complete", { note: "toast" }),
          description: numbersNode(formatFileSize(file.size)),
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
            <span className="tabular-nums">
              {t("{succeeded} succeeded, {failed} failed", {
                note: "toast",
                variables: {
                  succeeded: formatNumber(succeeded),
                  failed: formatNumber(failed),
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
            <span className="block [overflow-wrap:anywhere]">
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
  }, [
    enabled,
    phase,
    file,
    files,
    progress,
    error,
    t,
    formatError,
    formatFileSize,
    formatNumber,
  ]);

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
              done: formatNumber(
                files.filter((f) => f.status === "success").length,
              ),
              total: formatNumber(files.length),
            },
          }),
          description: numbersNode(
            `${formatFileSize(progress.loaded)} / ${formatFileSize(progress.total)}`,
          ),
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
            description: numbersNode(
              `${formatFileSize(singleProgress.loaded)} / ${formatFileSize(file.size)}`,
            ),
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
  }, [enabled, phase, file, files, progress, t, formatFileSize, formatNumber]);
}
