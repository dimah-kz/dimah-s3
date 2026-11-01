"use client";

import { ImagePlusIcon, PaperclipIcon, PlusIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadStatus,
  UploadToasts,
  UploadTrigger,
} from "@dimah-s3/ui";

export function UploadTriggerVariantsDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 3,
    maxFileSize: 75 * 1024 * 1024,
    queue: true,
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Upload upload={upload}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <UploadTrigger />
          <UploadTrigger variant="outline" />
          <UploadTrigger variant="secondary">
            <PaperclipIcon data-icon="inline-start" />
            Attach
          </UploadTrigger>
          <UploadTrigger variant="ghost" size="sm">
            <ImagePlusIcon data-icon="inline-start" />
            Add photos
          </UploadTrigger>
          <UploadTrigger
            variant="outline"
            size="icon"
            aria-label="Upload files"
            tooltip="Upload files"
          >
            <PlusIcon />
          </UploadTrigger>
        </div>
        <UploadStatus />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
