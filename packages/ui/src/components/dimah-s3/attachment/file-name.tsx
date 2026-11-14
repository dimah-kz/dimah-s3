"use client";

import type { ComponentProps, ReactNode } from "react";
import { findSearchMatches } from "@dimah-s3/core";
import { cn } from "cn";

/** A short suffix after the last dot. Longer or odd suffixes stay in the stem. */
const FILE_EXTENSION = /^\.[a-z0-9]{1,8}$/i;

/** The stem, and a short extension kept visible while the stem shortens. */
export function splitFileName(name: string): {
  stem: string;
  extension: string;
} {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, extension: "" };
  const extension = name.slice(dot);
  if (!FILE_EXTENSION.test(extension)) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension };
}

/** Props for {@link FileName}. Other props go to the outer `<span>`. */
export type FileNameProps = Omit<ComponentProps<"span">, "children"> & {
  name: string;
  /**
   * Keep a short extension visible while the rest shortens. Turn it off for
   * folder names. @default true
   */
  extension?: boolean;
  /**
   * Search text to mark in the name. It matches the way list search does:
   * case, accents, and look-alike letters do not count.
   */
  highlight?: string;
};

/** `text`, which starts at `offset` in the name, with the matches marked. */
function markMatches(
  text: string,
  offset: number,
  ranges: readonly [number, number][],
): ReactNode {
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    const from = Math.max(start - offset, at);
    const to = Math.min(end - offset, text.length);
    if (to <= from) continue;
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark
        key={from}
        data-slot="file-name-match"
        className="rounded-[2px] bg-dimah-s3-warning/30 text-inherit"
      >
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * A file name that fits the width it has: the stem ends in an ellipsis and
 * the extension stays visible (`a-very-long-na….pdf`). It is an isolate
 * (`dir="auto"`), so the name keeps its own direction inside the sentence or
 * row around it, and `title` holds the whole name.
 */
export function FileName({
  name,
  extension: keepExtension = true,
  highlight,
  className,
  ...props
}: FileNameProps) {
  const { stem, extension } = keepExtension
    ? splitFileName(name)
    : { stem: name, extension: "" };
  const ranges = highlight ? findSearchMatches(name, highlight) : [];
  return (
    <span
      data-slot="file-name"
      dir="auto"
      title={name}
      {...props}
      className={cn("inline-flex max-w-full min-w-0 align-top", className)}
    >
      <span className="min-w-0 truncate">{markMatches(stem, 0, ranges)}</span>
      {extension ? (
        <span className="shrink-0">
          {markMatches(extension, stem.length, ranges)}
        </span>
      ) : null}
    </span>
  );
}
