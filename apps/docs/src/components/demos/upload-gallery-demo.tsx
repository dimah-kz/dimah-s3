"use client";

import { ImagesIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadDropzone,
  UploadDropzoneTrigger,
  UploadStatus,
  UploadToasts,
} from "@dimah-s3/ui";

export function UploadGalleryDemo() {
  const upload = useUpload({
    route: "uploads",
    accept: ["image/*"],
    maxFiles: 8,
    maxFileSize: 10 * 1024 * 1024,
    queue: true,
  });

  return (
    <div className="mx-auto w-full max-w-lg">
      <Upload upload={upload}>
        <UploadDropzone>
          <UploadDropzoneTrigger>
            <ImagesIcon
              className="size-8 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Add photos to the album</p>
              <p className="text-xs text-muted-foreground">
                Drop up to 8 images, or click to choose them.
              </p>
            </div>
          </UploadDropzoneTrigger>
          <UploadStatus layout="grid" />
        </UploadDropzone>
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
