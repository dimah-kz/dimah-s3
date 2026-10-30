"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { fileNameFromKey, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import {
  isFetchDownload,
  useFormatDimahError,
  useFormatFileSize,
  type UseDownloadReturn,
} from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

export type DownloadToastTarget = UseDownloadReturn;

export type DownloadToastOptions = {
  enabled?: boolean;
  /** S3 object key — named `objectKey` because React reserves `key`. */
  objectKey: string;
  fileName?: string;
  fileSize?: number;
};

/**
 * Drives toasts from a `useDownload` return.
 * Shared by DownloadButton and ProgressDownloadButton.
 * Only the control whose `objectKey` matches the hook's active key toasts,
 * so a list can share one hook instance.
 */
export function useDownloadToast(
  download: DownloadToastTarget,
  { enabled = true, objectKey, fileName, fileSize }: DownloadToastOptions,
) {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const formatDimahError = useFormatDimahError();
  const displayName = fileName ?? fileNameFromKey(objectKey) ?? objectKey;
  const toastIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(download.phase);
  const cancelRef = useRef(
    isFetchDownload(download) ? download.cancel : undefined,
  );
  useLayoutEffect(() => {
    cancelRef.current = isFetchDownload(download) ? download.cancel : undefined;
  });

  const fetchMode = isFetchDownload(download);
  const phase = download.phase;
  const error = download.error;
  const url = fetchMode ? null : download.url;
  const resolvedFileName = fetchMode ? download.fileName : null;
  const progress = fetchMode ? download.progress : null;
  const activeKey = download.objectKey;

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (!enabled || activeKey !== objectKey) return;

    const errorNode = (value: unknown) => (
      <span className="block [overflow-wrap:anywhere]">
        {formatDimahError(value)}
      </span>
    );

    const closeLoading = () => {
      if (toastIdRef.current) {
        toast.close(toastIdRef.current);
        toastIdRef.current = null;
      }
    };

    if (fetchMode) {
      if (phase === "downloading") {
        closeLoading();
        toastIdRef.current = toast.add({
          type: "loading",
          timeout: 0,
          title: t("Downloading", { note: "toast" }),
          description: <bdi>{truncateFileName(displayName)}</bdi>,
          actionProps: {
            children: t("Cancel", { note: "toast action" }),
            onClick: () => cancelRef.current?.(),
          },
        });
        return;
      }
      if (phase === "success") {
        closeLoading();
        const actualName = resolvedFileName ?? displayName;
        toast.add({
          type: "success",
          title: t("Download complete", { note: "toast" }),
          description: (
            <span className="block">
              <bdi>{truncateFileName(actualName)}</bdi>
              {fileSize != null ? (
                <>
                  {" "}
                  ·{" "}
                  <bdi className="inline-block whitespace-nowrap tabular-nums">
                    {formatFileSize(fileSize)}
                  </bdi>
                </>
              ) : null}
            </span>
          ),
        });
        return;
      }
      if (phase === "error") {
        closeLoading();
        toast.add({
          type: "error",
          title: t("Download failed", { note: "toast" }),
          description: errorNode(error),
        });
        return;
      }
      if (
        phase === "idle" &&
        (prev === "presigning" || prev === "downloading")
      ) {
        closeLoading();
        toast.add({
          type: "info",
          title: t("Download cancelled", { note: "toast" }),
          description: <bdi>{truncateFileName(displayName)}</bdi>,
        });
      }
      return;
    }

    if (phase === "error") {
      toast.add({
        type: "error",
        title: t("Download failed", { note: "toast" }),
        description: errorNode(error),
      });
      return;
    }
    if (prev === "presigning" && phase === "idle" && url) {
      toast.add({
        type: "success",
        title: t("Download started", { note: "toast" }),
      });
    }
  }, [
    enabled,
    fetchMode,
    phase,
    error,
    url,
    resolvedFileName,
    displayName,
    fileSize,
    activeKey,
    objectKey,
    t,
    formatDimahError,
    formatFileSize,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      activeKey !== objectKey ||
      phase !== "downloading" ||
      !progress
    ) {
      return;
    }
    if (!toastIdRef.current) return;

    toast.update(toastIdRef.current, {
      type: "loading",
      timeout: 0,
      title: t("Downloading", { note: "toast" }),
      description: (
        <bdi className="inline-block whitespace-nowrap tabular-nums">
          {progress.total > 0
            ? `${formatFileSize(progress.loaded)} / ${formatFileSize(progress.total)}`
            : formatFileSize(progress.loaded)}
        </bdi>
      ),
      actionProps: {
        children: t("Cancel", { note: "toast action" }),
        onClick: () => cancelRef.current?.(),
      },
    });
  }, [enabled, phase, progress, t, activeKey, objectKey, formatFileSize]);
}
