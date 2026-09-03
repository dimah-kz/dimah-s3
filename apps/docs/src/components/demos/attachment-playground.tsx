"use client";

import { useState } from "react";
import {
  FileAttachment,
  StatusAttachment,
  type AttachmentOrientation,
  type AttachmentSize,
  type AttachmentState,
} from "@dimah-s3/ui";
import { ComponentPreview } from "@/components/component-preview";
import { PlaygroundOptionTabs } from "@/components/demos/playground-option-tabs";
import { cn } from "@/lib/utils";

const PREVIEW = "/dimah-avatar.png";

const SIZES = ["default", "sm", "xs"] as const satisfies AttachmentSize[];
const ORIENTATIONS = [
  "horizontal",
  "vertical",
] as const satisfies AttachmentOrientation[];
const STATES = [
  "idle",
  "uploading",
  "processing",
  "error",
  "done",
] as const satisfies AttachmentState[];

const STATUS = {
  idle: { title: "Preparing…" },
  uploading: { title: "Preparing…" },
  processing: { title: "Preparing…" },
  error: {
    title: "Upload failed",
    description: "Could not reach the server.",
  },
  done: { title: "Ready" },
} as const satisfies Record<
  AttachmentState,
  { title: string; description?: string }
>;

type Props = {
  /** Live demo source injected by the docs shell. */
  code?: string;
};

/** Docs-only playground. Apps should use upload, download, and delete UI instead. */
export function AttachmentPlayground({ code }: Props) {
  const [size, setSize] = useState<AttachmentSize>("sm");
  const [orientation, setOrientation] =
    useState<AttachmentOrientation>("horizontal");
  const [state, setState] = useState<AttachmentState>("uploading");

  const layout = { size, orientation };
  const uploading = state === "uploading";
  const canCancel = uploading || state === "processing";
  const canDismiss = state === "done" || state === "error";
  const statusState = state === "idle" ? "processing" : state;

  const toolbar = (
    <div className="flex flex-col gap-0.5 overflow-hidden rounded-xl border bg-fd-secondary/50 px-3">
      <PlaygroundOptionTabs
        label="Size"
        value={size}
        options={SIZES}
        onChange={setSize}
      />
      <PlaygroundOptionTabs
        label="Orientation"
        value={orientation}
        options={ORIENTATIONS}
        onChange={setOrientation}
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
        orientation === "vertical"
          ? "flex-wrap items-start justify-center gap-4"
          : "mx-auto max-w-md flex-col gap-2.5",
      )}
    >
      <FileAttachment
        {...layout}
        state={state}
        fileName="quarterly-report.pdf"
        fileSize={2_400_000}
        percent={uploading ? 64 : 0}
        error={state === "error" ? "Network error" : null}
        onCancel={canCancel ? () => setState("done") : undefined}
        onDismiss={canDismiss ? () => setState("idle") : undefined}
      />
      <FileAttachment
        {...layout}
        state={state}
        fileName="avatar.png"
        fileType="image/png"
        fileSize={180_000}
        previewUrl={PREVIEW}
        percent={uploading ? 42 : 0}
        error={state === "error" ? "Network error" : null}
        onDismiss={canDismiss ? () => setState("idle") : undefined}
      />
      <StatusAttachment
        {...layout}
        state={statusState}
        {...STATUS[statusState]}
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
