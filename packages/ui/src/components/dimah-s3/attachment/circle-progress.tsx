"use client";

import { useFormatNumber } from "@dimah-s3/react";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";

/** Side of the drawing box. The ring scales with the CSS size. */
const VIEW_BOX = 20;

export type CircleProgressProps = {
  /** Progress from 0 to 100. Values outside are clamped; NaN counts as 0. */
  percent: number;
  /** File the progress belongs to. It names the progressbar "Progress for {name}". */
  fileName?: string;
  /** Accessible name in place of the one from `fileName`, such as for a whole queue. */
  label?: string;
  /** Ring thickness in a 20 by 20 box. @default 2.5 */
  strokeWidth?: number;
  /** Sets the size, for example `size-6`. @default "size-5" */
  className?: string;
};

/**
 * Determinate progress ring with `role="progressbar"`, named by `label` or
 * by its file. Pass one of them.
 */
export function CircleProgress({
  percent,
  fileName,
  label,
  strokeWidth = 2.5,
  className,
}: CircleProgressProps) {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  const clamped = Number.isNaN(percent)
    ? 0
    : Math.min(100, Math.max(0, percent));
  const value = Math.round(clamped);
  const radius = (VIEW_BOX - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      className={cn("size-5 shrink-0 -rotate-90", className)}
      role="progressbar"
      aria-label={
        label ??
        t("Progress for {name}", {
          note: "progress",
          variables: { name: fileName ?? "" },
        })
      }
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={t("{percent}%", {
        note: "progress",
        variables: { percent: formatNumber(value) },
      })}
    >
      <circle
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-dimah-s3-muted-foreground/60"
      />
      <circle
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        strokeLinecap="round"
        className="text-dimah-s3-primary transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}
