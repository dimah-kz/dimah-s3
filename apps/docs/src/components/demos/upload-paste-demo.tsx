"use client";

import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadStatus,
  UploadToasts,
  UploadTrigger,
  usePasteFiles,
} from "@dimah-s3/ui";

export function UploadPasteDemo() {
  const upload = useUpload({
    route: "uploads",
    accept: ["image/*"],
    maxFiles: 4,
    maxFileSize: 10 * 1024 * 1024,
    queue: true,
  });
  // Files pasted anywhere on the page upload, except into text fields.
  usePasteFiles(upload);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Copy an image or a screenshot, then press{" "}
        <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">
          Ctrl
        </kbd>{" "}
        +{" "}
        <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">
          V
        </kbd>{" "}
        anywhere on this page.
      </p>
      <Upload upload={upload}>
        <UploadTrigger variant="outline" size="sm">
          Or choose images
        </UploadTrigger>
        <UploadStatus layout="grid" />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
