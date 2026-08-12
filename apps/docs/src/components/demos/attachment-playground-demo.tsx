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
import { ComponentPreview } from "@/components/component-preview";
import { cn } from "@/lib/utils";

const PREVIEW = "/dimah-avatar.jpg";

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
      <TabsList className="flex gap-3.5 overflow-x-auto px-1 text-fd-secondary-foreground not-prose">
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

type AttachmentPlaygroundDemoProps = {
  /** Live demo source injected by the docs shell. */
  code?: string;
};

/** Interactive Attachment playground — size, orientation, and state via Fumadocs Tabs. */
export function AttachmentPlaygroundDemo({
  code,
}: AttachmentPlaygroundDemoProps) {
  const [size, setSize] = useState<AttachmentSize>("sm");
  const [orientation, setOrientation] =
    useState<AttachmentOrientation>("horizontal");
  const [state, setState] = useState<AttachmentState>("uploading");

  const canCancel = state === "uploading" || state === "processing";
  const isVertical = orientation === "vertical";

  const toolbar = (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl border bg-fd-secondary/50 px-3">
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
  );

  const canvas = (
    <div
      className={cn(
        "flex w-full",
        isVertical
          ? "flex-wrap items-start justify-center gap-4"
          : "mx-auto max-w-md flex-col gap-2.5",
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
  );

  // When `code` is provided (docs shell), own the preview chrome so the
  // toolbar can sit above the bordered frame.
  if (code != null) {
    return (
      <ComponentPreview code={code} toolbar={toolbar}>
        {canvas}
      </ComponentPreview>
    );
  }

  return (
    <>
      {toolbar}
      {canvas}
    </>
  );
}
