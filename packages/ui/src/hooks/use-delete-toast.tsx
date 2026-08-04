"use client";

import { toast } from "sonner";
import { truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError } from "@dimah-s3/react";

export type DeleteToastOptions = {
  enabled?: boolean;
  displayName: string;
};

export function useDeleteToast({
  enabled = true,
  displayName,
}: DeleteToastOptions) {
  const t = useTranslations();
  const formatDimahError = useFormatDimahError();

  const onSuccess = (_key: string) => {
    if (!enabled) return;
    toast.success(t("File deleted", { note: "toast" }), {
      description: <span dir="auto">{truncateFileName(displayName)}</span>,
    });
  };

  const onError = (_key: string, error: unknown) => {
    if (!enabled) return;
    toast.error(t("Delete failed", { note: "toast" }), {
      description: (
        <span dir="auto" className="block [overflow-wrap:anywhere]">
          {formatDimahError(error)}
        </span>
      ),
    });
  };

  return { onSuccess, onError };
}
