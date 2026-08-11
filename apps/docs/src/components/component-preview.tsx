"use client";

import { useState } from "react";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { cn } from "@/lib/utils";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { Button } from "@/components/ui/button";

type ComponentPreviewProps = {
  children: React.ReactNode;
  code?: string;
  lang?: string;
  className?: string;
};

const codeBlockClassName =
  "[&_figure]:my-0 [&_figure]:rounded-none [&_figure]:border-0 [&_figure]:shadow-none";

export function ComponentPreview({
  children,
  code,
  lang = "tsx",
  className,
}: ComponentPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <DemoS3Provider>
      <div
        className={cn(
          "my-4 overflow-hidden rounded-md border sm:my-8",
          className,
        )}
      >
        <div className="not-prose flex min-h-[200px] w-full flex-col items-stretch justify-center p-4 py-6 sm:min-h-[220px] sm:p-8 sm:py-10">
          {children}
        </div>

        {code ? (
          <div className="relative border-t bg-fd-muted/50">
            {open ? (
              <>
                <div className={codeBlockClassName}>
                  <DynamicCodeBlock lang={lang} code={code} />
                </div>
                <div className="pointer-events-none absolute right-3 bottom-3 z-10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="pointer-events-auto bg-fd-background/90 backdrop-blur supports-backdrop-filter:bg-fd-background/80"
                    onClick={() => setOpen(false)}
                  >
                    Hide Code
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  aria-hidden
                  className={cn(
                    codeBlockClassName,
                    "pointer-events-none max-h-44 overflow-hidden opacity-55",
                  )}
                >
                  <DynamicCodeBlock
                    lang={lang}
                    code={code}
                    codeblock={{ allowCopy: false }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-transparent via-fd-muted/20 to-fd-muted/70">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(true)}
                  >
                    View Code
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </DemoS3Provider>
  );
}
