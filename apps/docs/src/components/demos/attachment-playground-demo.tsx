"use client";

import { useState } from "react";
import {
  FileAttachment,
  StatusAttachment,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";
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

function ToggleGroup<T extends string>({
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "secondary" : "outline"}
            className={cn(value === option && "ring-1 ring-ring/40")}
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Interactive Attachment playground — try size, orientation, and state. */
export function AttachmentPlaygroundDemo() {
  const [size, setSize] = useState<AttachmentSize>("sm");
  const [orientation, setOrientation] =
    useState<AttachmentOrientation>("horizontal");
  const [state, setState] = useState<AttachmentState>("uploading");

  const canCancel = state === "uploading" || state === "processing";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
        <ToggleGroup
          label="size"
          value={size}
          options={SIZES}
          onChange={setSize}
        />
        <ToggleGroup
          label="orientation"
          value={orientation}
          options={ORIENTATIONS}
          onChange={setOrientation}
        />
        <ToggleGroup
          label="state"
          value={state}
          options={STATES}
          onChange={setState}
        />
      </div>

      <div
        className={cn(
          "flex w-full rounded-md border border-dashed border-border/80 p-4",
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
