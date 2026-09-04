"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SpringPopInProps = {
  children?: ReactNode;
  damping?: number;
  mass?: number;
  stiffness?: number;
  delayInFrames?: number;
  speed?: number;
  fps?: number;
  durationInFrames?: number;
  className?: string;
};

/** framecn Spring Pop In, as an overlay (no own Timegroup). */
export function SpringPopIn({
  children,
  damping = 12,
  mass = 1,
  stiffness = 100,
  delayInFrames = 0,
  speed = 1,
  fps = 30,
  durationInFrames = 45,
  className,
}: SpringPopInProps) {
  const safeSpeed = Math.max(0.01, speed);
  const durationMs = ((durationInFrames / fps) * 1000) / safeSpeed;
  const delayMs = (delayInFrames / fps) * 1000;
  const springTension = Math.min(0.85, 0.34 + damping / 120 + mass * 0.04);
  const springOvershoot = Math.min(0.72, 0.56 + stiffness / 800);

  return (
    <div
      className={cn(className)}
      style={
        {
          animation: `framecn-spring-pop ${durationMs - delayMs}ms cubic-bezier(${springTension}, ${springOvershoot}, 0.64, 1) ${delayMs}ms both`,
          transformOrigin: "center",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
