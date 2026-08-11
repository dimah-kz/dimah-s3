"use client";

import { FileAttachment, StatusAttachment } from "@dimah-s3/ui";

const PREVIEW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#64748b"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/></svg>`,
  );

/** Horizontal vs vertical Attachment orientation. */
export function AttachmentOrientationDemo() {
  return (
    <div className="flex w-full flex-wrap items-start gap-3">
      <FileAttachment
        orientation="horizontal"
        state="done"
        fileName="brief.pdf"
        fileSize={420_000}
        className="min-w-56"
      />
      <FileAttachment
        orientation="vertical"
        state="done"
        fileName="cover.jpg"
        fileType="image/jpeg"
        fileSize={890_000}
        previewUrl={PREVIEW}
      />
      <StatusAttachment
        orientation="vertical"
        size="sm"
        state="processing"
        title="Preparing…"
      />
    </div>
  );
}
