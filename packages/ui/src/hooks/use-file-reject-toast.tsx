"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "@fuma-translate/react";
import { useFormatNumber, type FileRejection } from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

function rejectionSummary(
  rejections: readonly FileRejection[],
  t: ReturnType<typeof useTranslations>,
  formatNumber: (value: number) => string,
): ReactNode {
  const first = rejections[0];
  if (!first) {
    return t("Some files were rejected", { note: "toast" });
  }
  const detail =
    first.errors[0]?.message ??
    t("File type or size not allowed", { note: "toast" });
  if (rejections.length === 1) {
    return (
      <>
        <bdi>{first.file.name}</bdi>: {detail}
      </>
    );
  }
  return t("{count} files were rejected", {
    note: "toast",
    variables: { count: formatNumber(rejections.length) },
  });
}

/**
 * Toasts soft dropzone rejections (type / size / count).
 * Shared by UploadButton and UploadDropzone when `toast` is enabled.
 */
export function useFileRejectToast(
  fileRejections: readonly FileRejection[],
  enabled: boolean,
) {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const prevRef = useRef<readonly FileRejection[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (fileRejections.length === 0) {
      prevRef.current = fileRejections;
      return;
    }
    if (fileRejections === prevRef.current) return;
    prevRef.current = fileRejections;

    toast.add({
      type: "error",
      title: t("File not accepted", { note: "toast" }),
      description: (
        <span className="block [overflow-wrap:anywhere]">
          {rejectionSummary(fileRejections, t, formatNumber)}
        </span>
      ),
    });
  }, [enabled, fileRejections, t, formatNumber]);
}
