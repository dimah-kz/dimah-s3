"use client";

import { useState } from "react";
import { FileAttachment, type AttachmentState } from "@dimah-s3/ui";
import { cn } from "cn";
import { ComponentPreview } from "@/components/component-preview";
import { PlaygroundOptionTabs } from "@/components/demos/playground-option-tabs";

const PREVIEW = "/dimah-avatar.png";

const LAYOUTS = ["row", "card"] as const;
type Layout = (typeof LAYOUTS)[number];

/** `FileAttachment` has no layout prop. Its width picks the layout. */
const LAYOUT_CLASS: Record<Layout, string> = {
  row: "w-full",
  // Under 9rem of content width, the media stacks above the text.
  card: "w-32",
};

const STATES = [
  "idle",
  "uploading",
  "processing",
  "error",
  "done",
] as const satisfies AttachmentState[];

type Props = {
  /** Live demo source injected by the docs shell. */
  code?: string;
};

/** Docs-only playground. Apps should use upload, download, and delete UI instead. */
export function AttachmentPlayground({ code }: Props) {
  const [layout, setLayout] = useState<Layout>("row");
  const [state, setState] = useState<AttachmentState>("uploading");

  const className = LAYOUT_CLASS[layout];
  const uploading = state === "uploading";
  const canCancel = uploading || state === "processing";
  const canDismiss = state === "done" || state === "error";

  const toolbar = (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl border bg-fd-secondary/50 px-3">
      <PlaygroundOptionTabs
        label="Layout"
        value={layout}
        options={LAYOUTS}
        onChange={setLayout}
      />
      <PlaygroundOptionTabs
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
        layout === "card"
          ? "flex-wrap items-start justify-center gap-4"
          : "mx-auto max-w-md flex-col gap-2.5",
      )}
    >
      <FileAttachment
        className={className}
        state={state}
        fileName="quarterly-report.pdf"
        contentType="application/pdf"
        fileSize={2_400_000}
        percent={uploading ? 64 : 0}
        error={state === "error" ? "Network error" : null}
        onCancel={canCancel ? () => setState("done") : undefined}
        onDismiss={canDismiss ? () => setState("idle") : undefined}
      />
      <FileAttachment
        className={className}
        state={state}
        fileName="avatar.png"
        contentType="image/png"
        fileSize={180_000}
        previewUrl={PREVIEW}
        percent={uploading ? 42 : 0}
        error={state === "error" ? "Network error" : null}
        onDismiss={canDismiss ? () => setState("idle") : undefined}
      />
      <FileAttachment
        className={className}
        state={state}
        fileName="budget.xlsx"
        contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fileSize={84_000}
        percent={uploading ? 28 : 0}
        error={state === "error" ? "Network error" : null}
        onCancel={canCancel ? () => setState("done") : undefined}
        onDismiss={canDismiss ? () => setState("idle") : undefined}
      />
    </div>
  );

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
