"use client";

import { useState } from "react";
import {
  FileAttachment,
  StatusAttachment,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@dimah-s3/ui";
import { Tabs, TabsList, TabsTrigger } from "fumadocs-ui/components/ui/tabs";
import { cn } from "@/lib/utils";

const PREVIEW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#64748b"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/></svg>`,
  );

const SIZES: AttachmentSize[] = ["default", "sm", "xs"];
const ORIENTATIONS: AttachmentOrientation[] = ["horizontal", "vertical"];
const STATES: AttachmentState[] = [
  "idle",
  "uploading",
  "processing",
  "error",
  "done",
];

function VariantTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="w-full"
    >
      <TabsList className="flex gap-3.5 overflow-x-auto px-4 text-fd-secondary-foreground not-prose">
        <span className="my-auto me-auto text-sm font-medium text-fd-foreground">
          {label}
        </span>
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className="inline-flex items-center gap-2 border-b border-transparent py-2 text-sm font-medium whitespace-nowrap text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-active:border-fd-primary data-active:text-fd-primary"
          >
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Interactive Attachment playground — size, orientation, and state via Fumadocs Tabs. */
export function AttachmentPlaygroundDemo() {
  const [size, setSize] = useState<AttachmentSize>("sm");
  const [orientation, setOrientation] =
    useState<AttachmentOrientation>("horizontal");
  const [state, setState] = useState<AttachmentState>("uploading");

  const canCancel = state === "uploading" || state === "processing";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col overflow-hidden rounded-xl border bg-fd-secondary">
        <VariantTabs
          label="Size"
          value={size}
          options={SIZES}
          onChange={setSize}
        />
        <VariantTabs
          label="Orientation"
          value={orientation}
          options={ORIENTATIONS}
          onChange={setOrientation}
        />
        <VariantTabs
          label="State"
          value={state}
          options={STATES}
          onChange={setState}
        />
      </div>

      <div
        className={cn(
          "flex w-full rounded-xl border border-dashed border-fd-border bg-fd-background p-4",
          orientation === "vertical"
            ? "flex-wrap items-start gap-3"
            : "max-w-lg flex-col gap-3",
        )}
      >
        <FileAttachment
          size={size}
          orientation={orientation}
          state={state}
          fileName="quarterly-report.pdf"
          fileSize={2_400_000}
          percent={state === "uploading" ? 64 : 0}
          error={state === "error" ? "Network error" : null}
          onCancel={canCancel ? () => setState("done") : undefined}
        />
        <FileAttachment
          size={size}
          orientation={orientation}
          state={state === "error" ? "done" : state}
          fileName="avatar.png"
          fileType="image/png"
          fileSize={180_000}
          previewUrl={PREVIEW}
          percent={state === "uploading" ? 42 : 0}
        />
        <StatusAttachment
          size={size}
          orientation={orientation}
          state={state === "idle" ? "processing" : state}
          title={
            state === "error"
              ? "Upload failed"
              : state === "done"
                ? "Ready"
                : "Preparing…"
          }
          description={
            state === "error" ? "Could not reach the server." : undefined
          }
        />
      </div>
    </div>
  );
}
