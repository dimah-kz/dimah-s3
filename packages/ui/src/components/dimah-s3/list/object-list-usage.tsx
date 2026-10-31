"use client";

import { useFormatFileSize, useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";

/**
 * Bytes and file count from `list.usage`, with a meter when the usage
 * carries the server's `maxBytes` or `maxFiles`. Renders nothing until the
 * query sends `usage`.
 */
export function ObjectListUsage({ className }: { className?: string }) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const usage = list.usage ?? { totalBytes: 0, objectCount: 0 };
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const byteCap = finiteCap(usage.maxBytes);
  const fileCap = finiteCap(usage.maxFiles);
  const bytesLabel =
    byteCap == null
      ? formatFileSize(usage.totalBytes)
      : t("{used} of {max}", {
          note: "object list usage",
          variables: {
            used: formatFileSize(usage.totalBytes),
            max: formatFileSize(byteCap),
          },
        });
  const filesLabel =
    fileCap == null
      ? usage.objectCount === 1
        ? t("1 file", { note: "object list usage" })
        : t("{count} files", {
            note: "object list usage",
            variables: { count: formatNumber(usage.objectCount) },
          })
      : t("{count} of {max} files", {
          note: "object list usage",
          variables: {
            count: formatNumber(usage.objectCount),
            max: formatNumber(fileCap),
          },
        });
  const byteRatio = fillRatio(usage.totalBytes, byteCap);
  const fileRatio = fillRatio(usage.objectCount, fileCap);
  const tightest = tightestRatio(byteRatio, fileRatio);
  const over = tightest != null && tightest >= 1;
  const percent =
    tightest == null ? null : Math.min(100, Math.round(tightest * 100));

  if (!list.usage) return null;

  return (
    <div
      data-slot="object-list-usage"
      data-over={over ? "" : undefined}
      className={cn(
        "flex shrink-0 flex-col gap-1.5 border-b border-dimah-s3-border px-3 py-2",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs tabular-nums",
          over ? "text-dimah-s3-destructive" : "text-dimah-s3-muted-foreground",
        )}
      >
        {bytesLabel}
        <span aria-hidden> · </span>
        {filesLabel}
      </p>
      {percent != null ? (
        <div
          className="flex h-1 overflow-hidden rounded-full bg-dimah-s3-muted"
          aria-hidden
        >
          <div
            className={cn(
              "h-full",
              over ? "bg-dimah-s3-destructive" : "bg-dimah-s3-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function finiteCap(value: number | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function fillRatio(used: number, max: number | null) {
  if (max == null) return null;
  if (max === 0) return used > 0 ? 1 : 0;
  return used / max;
}

function tightestRatio(byteRatio: number | null, fileRatio: number | null) {
  if (byteRatio == null) return fileRatio;
  if (fileRatio == null) return byteRatio;
  return Math.max(byteRatio, fileRatio);
}
