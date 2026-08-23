"use client";

import { useLayoutEffect, useRef } from "react";
import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError } from "@dimah-s3/react";
import type { FetchDownloadPhase } from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

export type DownloadToastOptions = {
  enabled?: boolean;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
  cancel?: () => void;
};

export function useDownloadToast({
  enabled = true,
  objectKey,
  fileName,
  fileSize,
  cancel,
}: DownloadToastOptions) {
  const t = useTranslations();
  const formatDimahError = useFormatDimahError();
  const displayName = fileName ?? objectKey.split("/").pop() ?? objectKey;
  const toastIdRef = useRef<string | null>(null);
  const cancelRef = useRef(cancel);
  useLayoutEffect(() => {
    cancelRef.current = cancel;
  });

  const errorNode = (error: unknown) => (
    <span dir="auto" className="block [overflow-wrap:anywhere]">
      {formatDimahError(error)}
    </span>
  );

  const closeLoading = () => {
    if (toastIdRef.current) {
      toast.close(toastIdRef.current);
      toastIdRef.current = null;
    }
  };

  const onInitiated = () => {
    if (enabled) {
      toast.add({
        type: "success",
        title: t("Download started", { note: "toast" }),
      });
    }
  };

  const onDownloadStart = () => {
    if (!enabled) return;
    closeLoading();
    toastIdRef.current = toast.add({
      type: "loading",
      timeout: 0,
      title: t("Downloading", { note: "toast" }),
      description: (
        <span dir="auto">
          <bdi>{truncateFileName(displayName)}</bdi>
        </span>
      ),
      actionProps: {
        children: t("Cancel", { note: "toast action" }),
        onClick: () => cancelRef.current?.(),
      },
    });
  };

  const onProgress = (
    _key: string,
    progress: { loaded: number; total: number },
  ) => {
    if (!enabled || !toastIdRef.current) return;
    toast.update(toastIdRef.current, {
      type: "loading",
      timeout: 0,
      title: t("Downloading", { note: "toast" }),
      description: (
        <span dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
          {formatFileSize(progress.loaded)}
          {progress.total > 0 ? ` / ${formatFileSize(progress.total)}` : null}
        </span>
      ),
      actionProps: {
        children: t("Cancel", { note: "toast action" }),
        onClick: () => cancelRef.current?.(),
      },
    });
  };

  const onSuccess = (_key: string, actualFileName: string) => {
    if (!enabled) return;
    closeLoading();
    toast.add({
      type: "success",
      title: t("Download complete", { note: "toast" }),
      description: (
        <span className="block">
          <bdi>{truncateFileName(actualFileName)}</bdi>
          {fileSize != null ? (
            <>
              {" "}
              ·{" "}
              <span
                dir="ltr"
                className="inline-block whitespace-nowrap tabular-nums"
              >
                {formatFileSize(fileSize)}
              </span>
            </>
          ) : null}
        </span>
      ),
    });
  };

  const onError = (
    _key: string,
    error: unknown,
    _phase?: FetchDownloadPhase,
  ) => {
    if (!enabled) return;
    closeLoading();
    toast.add({
      type: "error",
      title: t("Download failed", { note: "toast" }),
      description: errorNode(error),
    });
  };

  const onCancel = (_key: string) => {
    if (!enabled) return;
    closeLoading();
    toast.add({
      type: "info",
      title: t("Download cancelled", { note: "toast" }),
      description: <span dir="auto">{truncateFileName(displayName)}</span>,
    });
  };

  return {
    onInitiated,
    onDownloadStart,
    onProgress,
    onSuccess,
    onError,
    onCancel,
  };
}
