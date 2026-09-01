"use client";

import { useUpload } from "@dimah-s3/react";
import { UploadDropzone } from "@dimah-s3/ui";

export function UploadDropzoneDemo() {
  const upload = useUpload({
    route: "avatar",
    maxFiles: 1,
    maxFileSize: 2 * 1024 * 1024,
  });

  return <UploadDropzone upload={upload} className="w-full max-w-md" />;
}
