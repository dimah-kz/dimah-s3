"use client";

import { useEffect, useRef } from "react";
import { truncateFileName } from "@dimah-s3/core";
import { useTranslations } from "@fuma-translate/react";
import { useFormatDimahError, type UseDeleteReturn } from "@dimah-s3/react";

import { toast } from "@/components/ui/toast";

export type DeleteToastOptions = {
  enabled?: boolean;
  objectKey: string;
  displayName: string;
};

/**
 * Drives toasts from {@link UseDeleteReturn} phase changes.
 * Only the control whose `objectKey` matches the hook's active key toasts.
 */
export function useDeleteToast(
  del: UseDeleteReturn,
  { enabled = true, objectKey, displayName }: DeleteToastOptions,
) {
  const t = useTranslations();
  const formatDimahError = useFormatDimahError();
  const prevPhaseRef = useRef(del.phase);

  useEffect(() => {
    if (prevPhaseRef.current === del.phase) return;
    prevPhaseRef.current = del.phase;
    if (!enabled || del.objectKey !== objectKey) return;

    if (del.phase === "success") {
      toast.add({
        type: "success",
        title: t("File deleted", { note: "toast" }),
        description: <span dir="auto">{truncateFileName(displayName)}</span>,
      });
    }
    if (del.phase === "error") {
      toast.add({
        type: "error",
        title: t("Delete failed", { note: "toast" }),
        description: (
          <span dir="auto" className="block [overflow-wrap:anywhere]">
            {formatDimahError(del.error)}
          </span>
        ),
      });
    }
  }, [
    enabled,
    del.phase,
    del.error,
    del.objectKey,
    objectKey,
    displayName,
    t,
    formatDimahError,
  ]);
}
