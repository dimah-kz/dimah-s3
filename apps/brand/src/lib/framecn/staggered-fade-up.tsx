"use client";

import type { CSSProperties } from "react";
import { cn } from "cn";

export type StaggeredFadeUpProps = {
  text: string;
  staggerDelay?: number;
  delayInFrames?: number;
  distance?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  speed?: number;
  fps?: number;
  className?: string;
};

/** framecn Staggered Fade Up, as an overlay (no own Timegroup). */
export function StaggeredFadeUp({
  text,
  staggerDelay = 4,
  delayInFrames = 0,
  distance = 20,
  fontSize = 72,
  color = "#171717",
  fontWeight = 600,
  speed = 1,
  fps = 30,
  className,
}: StaggeredFadeUpProps) {
  const frameMs = 1000 / fps;
  const delayMs = (delayInFrames * frameMs) / speed;
  const staggerMs = (staggerDelay * frameMs) / speed;
  const wordAnimationDurationMs = 12 * frameMs;
  const words = text.split(" ");

  return (
    <span
      className={cn(className)}
      style={
        {
          "--framecn-distance": `${distance}px`,
          color,
          fontSize,
          fontWeight,
          letterSpacing: "-0.03em",
        } as CSSProperties
      }
    >
      {words.map((word, i) => (
        <span
          key={`${word}-${String(i)}`}
          style={{
            animation: `framecn-fade-up ${wordAnimationDurationMs}ms ease-out ${delayMs + i * staggerMs}ms both`,
            display: "inline-block",
            marginInlineEnd: i === words.length - 1 ? 0 : "0.25em",
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
