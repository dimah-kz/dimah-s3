"use client";

import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadStatus,
  UploadToasts,
  UploadTrigger,
} from "@dimah-s3/ui";

export function UploadButtonDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFileSize: 75 * 1024 * 1024,
  });

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
      <Upload upload={upload}>
        <UploadTrigger />
        <UploadStatus />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
