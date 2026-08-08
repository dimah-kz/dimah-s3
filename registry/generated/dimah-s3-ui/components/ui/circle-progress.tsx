"use client";

export function CircleProgress({
  percent,
  size = 20,
  strokeWidth = 2.5,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
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
        className="text-primary transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}
