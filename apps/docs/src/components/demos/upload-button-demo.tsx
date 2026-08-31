"use client";

import { UploadButton } from "@dimah-s3/ui";

export function UploadButtonDemo() {
  return (
    <UploadButton
      route="uploads"
      maxFiles={5}
      concurrentFiles={2}
      maxFileSize={75 * 1024 * 1024}
      label="Upload files"
      toast={true}
      tooltipText="Upload up to 5 files"
    />
  );
}
