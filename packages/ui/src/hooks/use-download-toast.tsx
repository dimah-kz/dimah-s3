"use client";

import { formatFileSize, truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError } from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

export type DownloadToastOptions = {
  enabled?: boolean;
  objectKey: string;
  fileName?: string;
  fileSize?: number;
};

export function useDownloadToast({
  enabled = true,
  objectKey,
  fileName,
  fileSize,
}: DownloadToastOptions) {
  const t = useTranslations();
  const formatDimahError = useFormatDimahError();
  const displayName = fileName ?? objectKey.split("/").pop() ?? objectKey;

  const errorNode = (error: unknown) => (
    <span dir="auto" className="block [overflow-wrap:anywhere]">
      {formatDimahError(error)}
    </span>
  );

  const onInitiated = () => {
    if (enabled) {
      toast.add({
        type: "success",
        title: t("Download started", { note: "toast" }),
      });
    }
  };

  const onSuccess = (_key: string, actualFileName: string) => {
    if (!enabled) return;
    toast.close(`dl-${objectKey}`);
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

  const onError = (_key: string, error: unknown) => {
    if (!enabled) return;
    toast.close(`dl-${objectKey}`);
    toast.add({
      type: "error",
      title: t("Download failed", { note: "toast" }),
      description: errorNode(error),
    });
  };

  const onErrorWithPhase = (_key: string, error: unknown, _phase: string) => {
    if (!enabled) return;
    toast.close(`dl-${objectKey}`);
    toast.add({
      type: "error",
      title: t("Download failed", { note: "toast" }),
      description: errorNode(error),
    });
  };

  const onCancel = (_key: string) => {
    if (!enabled) return;
    toast.close(`dl-${objectKey}`);
    toast.add({
      type: "info",
      title: t("Download cancelled", { note: "toast" }),
      description: <span dir="auto">{truncateFileName(displayName)}</span>,
    });
  };

  return { onInitiated, onSuccess, onError, onErrorWithPhase, onCancel };
}
