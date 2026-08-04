"use client";

import { UploadDropzone } from "@dimah-s3/ui";

export function UploadDropzoneDemo() {
  return (
    <UploadDropzone
      objectKey={(file) => `demo/${Date.now()}-${file.name}`}
      maxFiles={5}
      concurrentFiles={2}
      accept={["image/*", ".pdf", ".txt"]}
      maxFileSize={25 * 1024 * 1024}
      className="w-full max-w-md"
    />
  );
}
