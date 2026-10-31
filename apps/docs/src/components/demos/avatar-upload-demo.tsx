"use client";

import { useState } from "react";
import { useUpload } from "@dimah-s3/react";
import { AvatarUpload, UploadToasts } from "@dimah-s3/ui";
import { rememberDemoFile } from "@/lib/demo/client-object-store";

export function AvatarUploadDemo() {
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const upload = useUpload({
    route: "avatar",
    accept: ["image/*"],
    maxFileSize: 5 * 1024 * 1024,
    // Demo only: keep the bytes in the browser so the image can be shown.
    onSuccess: (result, file) => rememberDemoFile(result.key, file),
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <AvatarUpload
        upload={upload}
        route="avatar"
        objectKey={avatarKey}
        label="Change profile photo"
        onChange={(result) => setAvatarKey(result.key)}
      />
      <p className="text-sm text-fd-muted-foreground">
        Click or drop an image.
      </p>
      <UploadToasts upload={upload} />
    </div>
  );
}
