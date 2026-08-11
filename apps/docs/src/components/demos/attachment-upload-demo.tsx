"use client";

import { UploadButton } from "@dimah-s3/ui";

/** Live upload with a compact attachment status row. */
export function AttachmentUploadDemo() {
  return (
    <UploadButton
      objectKey={(file) => `demo/${Date.now()}-${file.name}`}
      maxFiles={3}
      concurrentFiles={2}
      maxFileSize={25 * 1024 * 1024}
      label="Try upload"
      toast={false}
      attachmentSize="sm"
      tooltipText="Upload to see the attachment status row"
    />
  );
}
