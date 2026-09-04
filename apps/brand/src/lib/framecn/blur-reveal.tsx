"use client";

import type { CSSProperties } from "react";
import { cn } from "cn";

export type BlurRevealProps = {
  text?: string;
  blur?: number;
  delayInFrames?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  speed?: number;
  fps?: number;
  durationInFrames?: number;
  className?: string;
};

/** framecn Blur Reveal, as an overlay (no own Timegroup). */
export function BlurReveal({
  text = "BlurReveal",
  blur = 10,
  delayInFrames = 0,
  fontSize = 48,
  color = "#171717",
  fontWeight = 600,
  speed = 1,
  fps = 30,
  durationInFrames = 90,
  className,
}: BlurRevealProps) {
  const safeSpeed = Math.max(0.01, speed);
  const delayMs = (delayInFrames / fps) * 1000;
  const revealDurationMs =
    (((durationInFrames * 0.6) / fps) * 1000) / safeSpeed;

  return (
    <span
      className={cn(className)}
      style={
        {
          "--framecn-blur": `${blur}px`,
          animation: `framecn-blur-reveal ${revealDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms both`,
          color,
          fontSize,
          fontWeight,
          letterSpacing: "-0.05em",
        } as CSSProperties
      }
    >
      {text}
    </span>
  );
}
