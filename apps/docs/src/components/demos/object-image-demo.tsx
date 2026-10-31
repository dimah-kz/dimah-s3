"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import { ObjectImage, Upload, UploadToasts, UploadTrigger } from "@dimah-s3/ui";
import { rememberDemoFile } from "@/lib/demo/client-object-store";

export function ObjectImageDemo() {
  const [imageKey, setImageKey] = useState<string | null>(null);
  const upload = useUpload({
    route: "avatar",
    accept: ["image/*"],
    maxFileSize: 5 * 1024 * 1024,
    onSuccess: (result, file) => {
      // Demo only: keep the bytes in the browser so the image can be shown.
      rememberDemoFile(result.key, file);
      setImageKey(result.key);
    },
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <ObjectImage
        route="avatar"
        objectKey={imageKey}
        alt="Uploaded image"
        className="size-40 rounded-xl border object-cover"
        fallback={
          <div className="flex size-40 items-center justify-center rounded-xl border border-dashed text-fd-muted-foreground">
            <ImageIcon className="size-6" aria-hidden />
          </div>
        }
      />
      <Upload upload={upload}>
        <UploadTrigger size="sm">Choose an image</UploadTrigger>
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
