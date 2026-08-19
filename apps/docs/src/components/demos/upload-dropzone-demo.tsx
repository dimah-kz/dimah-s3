"use client";

import { UploadDropzone } from "@dimah-s3/ui";

export function UploadDropzoneDemo() {
  return (
    <UploadDropzone
      objectKey={(file) => `uploads/${file.name}`}
      maxFiles={5}
      concurrentFiles={2}
      maxFileSize={75 * 1024 * 1024}
      className="w-full max-w-md"
    />
  );
}
