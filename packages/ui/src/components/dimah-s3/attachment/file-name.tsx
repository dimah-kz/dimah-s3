"use client";

import type { ComponentProps } from "react";
import { cn } from "cn";

/** A short suffix after the last dot. Longer or odd suffixes stay in the stem. */
const FILE_EXTENSION = /^\.[a-z0-9]{1,8}$/i;

/** The stem, and a short extension kept visible while the stem shortens. */
export function splitFileName(name: string): { stem: string; extension: string } {
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
};

/**
 * A file name that fits the width it has: the stem ends in an ellipsis and
 * the extension stays visible (`a-very-long-na….pdf`). It is an isolate
 * (`dir="auto"`), so the name keeps its own direction inside the sentence or
 * row around it, and `title` holds the whole name.
 */
export function FileName({
  name,
  extension: keepExtension = true,
  className,
  ...props
}: FileNameProps) {
  const { stem, extension } = keepExtension
    ? splitFileName(name)
    : { stem: name, extension: "" };
  return (
    <span
      data-slot="file-name"
      dir="auto"
      title={name}
      {...props}
      className={cn("inline-flex max-w-full min-w-0 align-top", className)}
    >
      <span className="min-w-0 truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}
