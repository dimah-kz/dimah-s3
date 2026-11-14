"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "cn";

/** A shell command with a copy button. */
export function InstallCommand({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      className={cn(
        "flex h-10 w-full max-w-md min-w-0 items-center gap-2.5 rounded-lg border border-fd-border bg-fd-card ps-3.5 pe-1 font-mono text-[13px]",
        className,
      )}
    >
      <span aria-hidden className="text-fd-muted-foreground select-none">
        $
      </span>
      <code className="min-w-0 flex-1 truncate text-fd-foreground">
        {command}
      </code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
          });
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fd-muted-foreground transition-colors outline-none hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        {copied ? (
          <CheckIcon aria-hidden className="size-3.5" />
        ) : (
          <CopyIcon aria-hidden className="size-3.5" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
