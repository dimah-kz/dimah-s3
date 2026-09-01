"use client";

import { useUpload } from "@dimah-s3/react";
import { UploadButton } from "@dimah-s3/ui";

export function UploadButtonDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 5,
    concurrentFiles: 2,
    maxFileSize: 75 * 1024 * 1024,
  });

  return (
    <UploadButton
      upload={upload}
      label="Upload files"
      toast={true}
      tooltipText="Upload up to 5 files"
    />
  );
}
