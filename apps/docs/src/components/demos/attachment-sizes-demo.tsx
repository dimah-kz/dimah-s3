"use client";

import { FileAttachment } from "@dimah-s3/ui";

const PREVIEW =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#64748b"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/></svg>`,
  );

/** Stock Attachment `size` variants on `FileAttachment`. */
export function AttachmentSizesDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <FileAttachment
        size="default"
        state="uploading"
        fileName="quarterly-report.pdf"
        fileSize={2_400_000}
        percent={64}
      />
      <FileAttachment
        size="sm"
        state="done"
        fileName="avatar.png"
        fileType="image/png"
        fileSize={180_000}
        previewUrl={PREVIEW}
      />
      <FileAttachment
        size="xs"
        state="error"
        fileName="export.csv"
        fileSize={12_000}
        error="Network error"
      />
    </div>
  );
}
