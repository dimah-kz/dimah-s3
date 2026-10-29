"use client";

import { formatFileSize } from "@dimah-s3/core";
import type { ObjectListUsage } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import type { ObjectListUsageLimits } from "@/components/dimah-s3/list/object-list";

export function ObjectListUsageLine({
  usage,
  limits,
}: {
  usage: ObjectListUsage;
  limits?: ObjectListUsageLimits;
}) {
  const t = useTranslations();
  const byteCap = finiteCap(limits?.maxBytes);
  const fileCap = finiteCap(limits?.maxFiles);
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
            variables: { count: String(usage.objectCount) },
          })
      : t("{count} of {max} files", {
          note: "object list usage",
          variables: {
            count: String(usage.objectCount),
            max: String(fileCap),
          },
        });
  const byteRatio = fillRatio(usage.totalBytes, byteCap);
  const fileRatio = fillRatio(usage.objectCount, fileCap);
  const tightest = tightestRatio(byteRatio, fileRatio);
  const over = tightest != null && tightest >= 1;
  const percent =
    tightest == null ? null : Math.min(100, Math.round(tightest * 100));

  return (
    <div className="flex flex-col gap-1.5 border-b border-dimah-s3-border px-3 py-2">
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
