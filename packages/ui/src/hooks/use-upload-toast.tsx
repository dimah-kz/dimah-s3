"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { formatFileSize } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError } from "@dimah-s3/react";
import type {
  DimahS3Error,
  UploadFileInfo,
  UploadProgress,
  MultiUploadFileState,
} from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

export type UploadToastCtrl = {
  mode: "single" | "multi";
  phase: string;
  fileInfo?: UploadFileInfo | null;
  progress?: UploadProgress;
  files?: MultiUploadFileState[];
  totalProgress?: UploadProgress;
  error: DimahS3Error | null;
  cancel: () => void;
};

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
export function useUploadToast(ctrl: UploadToastCtrl, enabled: boolean) {
  const t = useTranslations();
  const formatError = useFormatDimahError();
  const toastIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(ctrl.phase);
  const cancelRef = useRef(ctrl.cancel);
  useLayoutEffect(() => {
    cancelRef.current = ctrl.cancel;
  });

  const { mode, phase, fileInfo, progress, files, totalProgress, error } = ctrl;

  // Phase-transition toasts (once per phase change)
  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (!enabled) return;

    const fileList = files ?? [];
    const isMulti = mode === "multi" && fileList.length > 1;
    const file =
      fileInfo ??
      (fileList.length === 1
        ? { name: fileList[0].name, size: fileList[0].size }
        : null);
    const total = totalProgress?.total ?? 0;

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
            variables: { count: String(fileList.length) },
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
      if (isMulti && fileList.length > 0) {
        const succeeded = fileList.filter((f) => f.status === "success").length;
        const failed = fileList.filter((f) => f.status === "error").length;
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
                : fileList[0]?.error
                  ? formatError(fileList[0].error)
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
    mode,
    fileInfo,
    files,
    totalProgress,
    error,
    t,
    formatError,
  ]);

  // Progress toast (updated on each progress tick)
  useEffect(() => {
    if (!enabled || phase !== "uploading") return;

    const fileList = files ?? [];
    const isMulti = mode === "multi" && fileList.length > 1;
    const file =
      fileInfo ??
      (fileList.length === 1
        ? { name: fileList[0].name, size: fileList[0].size }
        : null);
    const total = totalProgress ?? { loaded: 0, total: 0, percent: 0 };
    const singleProgress =
      progress ??
      (fileList.length === 1
        ? fileList[0].progress
        : { loaded: 0, total: 0, percent: 0 });

    const payload = isMulti
      ? {
          type: "loading" as const,
          timeout: 0,
          title: t("Uploading {done}/{total}", {
            note: "toast",
            variables: {
              done: String(
                fileList.filter((f) => f.status === "success").length,
              ),
              total: String(fileList.length),
            },
          }),
          description: progressNode(total.loaded, total.total),
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
  }, [enabled, phase, mode, fileInfo, files, progress, totalProgress, t]);
}
