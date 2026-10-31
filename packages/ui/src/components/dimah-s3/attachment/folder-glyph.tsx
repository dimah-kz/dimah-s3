"use client";

import { cn } from "cn";

export type FolderGlyphProps = {
  className?: string;
};

/**
 * File-manager folder. The yellow is the glyph itself, in light and dark,
 * the same way a desktop folder stays yellow.
 */
export function FolderGlyph({ className }: FolderGlyphProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      aria-hidden
    >
      <path
        fill="#E2AE1A"
        d="M4 9.2A2.2 2.2 0 0 1 6.2 7h5.1c.5 0 .9.2 1.2.5l1.3 1.4c.2.2.4.3.7.3h9.3A2.2 2.2 0 0 1 26 11.4V13H4V9.2Z"
      />
      <path
        fill="#F6C445"
        d="M4 12.2h24v11.3A2.5 2.5 0 0 1 25.5 26h-19A2.5 2.5 0 0 1 4 23.5V12.2Z"
      />
    </svg>
  );
}
