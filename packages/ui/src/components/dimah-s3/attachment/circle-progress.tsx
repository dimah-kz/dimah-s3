"use client";

import { cn } from "cn";

export function CircleProgress({
  percent,
  size = 20,
  strokeWidth = 2.5,
  className,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible name. When omitted the graphic is hidden from AT. */
  label?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      className={cn("shrink-0 -rotate-90", className)}
      style={{ width: size, height: size }}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(percent) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-dimah-s3-muted-foreground/60"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-dimah-s3-primary transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}
