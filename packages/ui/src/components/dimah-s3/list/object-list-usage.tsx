"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useFormatFileSize,
  useFormatNumber,
  type ObjectListUsageData,
} from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";

/** Side of the ring's drawing box. The ring scales with the CSS size. */
const VIEW_BOX = 20;

/** Ring thickness in the 20 by 20 box. */
const STROKE = 2;

/** What {@link ObjectListUsage} is showing. A function `children` receives it. */
export type ObjectListUsageState = {
  /** Totals on screen. */
  usage: ObjectListUsageData;
  /** "1.2 MB", or "1.2 MB of 10 MB" when `maxBytes` is set. */
  bytesLabel: string;
  /** "3 files", or "3 of 4 files" when `maxFiles` is set. */
  filesLabel: string;
  /** `totalBytes / maxBytes`. Null when there is no byte cap. */
  byteRatio: number | null;
  /** `objectCount / maxFiles`. Null when there is no file cap. */
  fileRatio: number | null;
  /**
   * Fill of the ring, from 0 upward. The byte cap when `maxBytes` is set,
   * otherwise the file cap. Null when there is no cap.
   */
  meterRatio: number | null;
  /** A byte cap or a file cap is reached. */
  over: boolean;
};

/** Props for {@link ObjectListUsage}. */
export type ObjectListUsageProps = {
  className?: string;
  /**
   * Totals to show. Defaults to `list.usage`: the scope, for
   * `dbObjectSource` and `memoryObjectSource`, in every folder. Pass a
   * folder's own totals to show that folder. `null` hides the line.
   */
  usage?: ObjectListUsageData | null;
  /**
   * Replaces the ring and the summary. A function receives the usage on
   * screen. Render `ObjectListUsageMeter` inside it to keep the ring.
   */
  children?: ReactNode | ((state: ObjectListUsageState) => ReactNode);
};

/** Props for {@link ObjectListUsageMeter}. */
export type ObjectListUsageMeterProps = {
  className?: string;
};

const ObjectListUsageContext = createContext<ObjectListUsageState | null>(
  null,
);

function useObjectListUsageState() {
  const value = useContext(ObjectListUsageContext);
  if (!value) {
    throw new Error(
      "[dimah-s3] ObjectListUsageMeter must be rendered inside <ObjectListUsage>.",
    );
  }
  return value;
}

/**
 * Bytes and file count for the list. With `maxBytes` or `maxFiles`, a small
 * ring sits behind the percent. Renders nothing until there is usage to show.
 *
 * `list.usage` is the scope total. Pass `usage` or `children` to show a
 * folder, or any other total, in the same place.
 */
export function ObjectListUsage({
  className,
  usage: usageProp,
  children,
}: ObjectListUsageProps) {
  const t = useTranslations();
  const { list } = useObjectListContext();
  const formatFileSize = useFormatFileSize();
  const formatNumber = useFormatNumber();
  const usage = usageProp !== undefined ? usageProp : list.usage;
  const state =
    usage == null
      ? null
      : toUsageState(usage, { t, formatFileSize, formatNumber });

  if (!state) return null;

  return (
    <ObjectListUsageContext.Provider value={state}>
      <div
        data-slot="object-list-usage"
        data-over={state.over ? "" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-dimah-s3-border px-3 py-1.5",
          className,
        )}
      >
        {children == null ? (
          <>
            <ObjectListUsageMeter />
            <UsageSummary state={state} />
          </>
        ) : typeof children === "function" ? (
          children(state)
        ) : (
          children
        )}
      </div>
    </ObjectListUsageContext.Provider>
  );
}

/**
 * Cap ring with the percent in front of it. The byte cap when `maxBytes`
 * is set, otherwise the file cap. Renders nothing when there is no cap.
 * The summary beside it is the accessible text, so the ring stays hidden
 * from assistive technology.
 */
export function ObjectListUsageMeter({ className }: ObjectListUsageMeterProps) {
  const formatNumber = useFormatNumber();
  const { meterRatio } = useObjectListUsageState();
  if (meterRatio == null) return null;

  const clamped = Math.min(1, Math.max(0, meterRatio));
  const percent = Math.round(clamped * 100);
  const over = meterRatio >= 1;
  const radius = (VIEW_BOX - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      data-slot="object-list-usage-meter"
      aria-hidden
      className={cn(
        "relative grid size-7 shrink-0 place-items-center",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx={VIEW_BOX / 2}
          cy={VIEW_BOX / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-dimah-s3-muted-foreground/60"
        />
        <circle
          cx={VIEW_BOX / 2}
          cy={VIEW_BOX / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          strokeLinecap="round"
          className={cn(
            "transition-[stroke-dashoffset] duration-200",
            over ? "text-dimah-s3-destructive" : "text-dimah-s3-primary",
          )}
        />
      </svg>
      <span
        className={cn(
          "text-[0.625rem] leading-none font-medium tabular-nums",
          over ? "text-dimah-s3-destructive" : "text-dimah-s3-foreground",
        )}
      >
        {formatNumber(percent)}
      </span>
    </span>
  );
}

function UsageSummary({ state }: { state: ObjectListUsageState }) {
  return (
    <p
      className={cn(
        "min-w-0 text-xs tabular-nums",
        state.over
          ? "text-dimah-s3-destructive"
          : "text-dimah-s3-muted-foreground",
      )}
    >
      {state.bytesLabel}
      <span aria-hidden> · </span>
      {state.filesLabel}
    </p>
  );
}

function toUsageState(
  usage: ObjectListUsageData,
  format: {
    t: ReturnType<typeof useTranslations>;
    formatFileSize: (bytes: number) => string;
    formatNumber: (value: number) => string;
  },
): ObjectListUsageState {
  const { t, formatFileSize, formatNumber } = format;
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
  const meterRatio = byteRatio ?? fileRatio;
  const tightest = tightestRatio(byteRatio, fileRatio);

  return {
    usage,
    bytesLabel,
    filesLabel,
    byteRatio,
    fileRatio,
    meterRatio,
    over: tightest != null && tightest >= 1,
  };
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
