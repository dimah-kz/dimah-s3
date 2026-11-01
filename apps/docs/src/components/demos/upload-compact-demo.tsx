"use client";

import { FileUpIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadDropzone,
  UploadDropzoneTrigger,
  UploadStatus,
  UploadToasts,
  useUploadHints,
} from "@dimah-s3/ui";

export function UploadCompactDemo() {
  const upload = useUpload({
    route: "uploads",
    accept: ["application/pdf"],
    maxFileSize: 20 * 1024 * 1024,
  });
  // The route's limits as text, such as "Up to 20.0 MB."
  const hints = useUploadHints(upload.policy);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2">
      <Upload upload={upload}>
        <UploadDropzone>
          <UploadDropzoneTrigger className="min-h-0 flex-row justify-start gap-3 p-3 text-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <FileUpIcon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                Drop your contract, or{" "}
                <span className="text-primary underline underline-offset-4">
                  browse
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                PDF only. {hints.limits}
              </span>
            </span>
          </UploadDropzoneTrigger>
        </UploadDropzone>
        {/* Outside the dropzone, so it keeps its own place in the layout. */}
        <UploadStatus />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
