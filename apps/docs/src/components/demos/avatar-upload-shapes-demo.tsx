"use client";

import { useState } from "react";
import { useUpload } from "@dimah-s3/react";
import { AvatarUpload, UploadToasts } from "@dimah-s3/ui";
import { rememberDemoFile } from "@/lib/demo/client-object-store";

export function AvatarUploadShapesDemo() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-8">
      <Example label="64 px" size={64} />
      <Example label="96 px" size={96} />
      <Example label="Square, for logos" size={96} shape="square" />
    </div>
  );
}

function Example({
  label,
  size,
  shape,
}: {
  label: string;
  size: number;
  shape?: "circle" | "square";
}) {
  const [imageKey, setImageKey] = useState<string | null>(null);
  const upload = useUpload({
    route: "avatar",
    accept: ["image/*"],
    maxFileSize: 5 * 1024 * 1024,
    // Demo only: keep the bytes in the browser so the image can be shown.
    onSuccess: (result, file) => rememberDemoFile(result.key, file),
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <AvatarUpload
        upload={upload}
        route="avatar"
        objectKey={imageKey}
        label={`Change image (${label})`}
        size={size}
        shape={shape}
        onChange={(result) => setImageKey(result.key)}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
      <UploadToasts upload={upload} />
    </div>
  );
}
