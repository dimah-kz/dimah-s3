"use client";

import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadDropzone,
  UploadStatus,
  UploadToasts,
} from "@dimah-s3/ui";

export function UploadDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 4,
    maxFileSize: 75 * 1024 * 1024,
    queue: true,
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Upload upload={upload}>
        <UploadDropzone />
        <UploadStatus />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
