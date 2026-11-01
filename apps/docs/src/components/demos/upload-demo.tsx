"use client";

import { useUpload } from "@dimah-s3/react";
import { Upload, UploadDropzone, UploadToasts } from "@dimah-s3/ui";

export function UploadDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 4,
    maxFileSize: 75 * 1024 * 1024,
    queue: true,
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <Upload upload={upload}>
        <UploadDropzone />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
