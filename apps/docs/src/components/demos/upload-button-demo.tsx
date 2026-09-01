"use client";

import { useUpload } from "@dimah-s3/react";
import { UploadButton } from "@dimah-s3/ui";

export function UploadButtonDemo() {
  const upload = useUpload({
    route: "avatar",
    maxFiles: 1,
    maxFileSize: 2 * 1024 * 1024,
  });

  return (
    <UploadButton
      upload={upload}
      label="Upload avatar"
      toast={true}
      tooltipText="Upload profile image"
    />
  );
}
