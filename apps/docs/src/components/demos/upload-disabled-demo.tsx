"use client";

import { useState } from "react";
import { LockIcon, LockOpenIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadDropzone,
  UploadToasts,
  UploadTrigger,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

export function UploadDisabledDemo() {
  const [locked, setLocked] = useState(true);
  const upload = useUpload({
    route: "uploads",
    maxFiles: 2,
    maxFileSize: 75 * 1024 * 1024,
    // Every part follows the hook: the picker, drops, and pastes stop.
    disabled: locked,
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Upload upload={upload}>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocked((value) => !value)}
          >
            {locked ? (
              <LockOpenIcon data-icon="inline-start" />
            ) : (
              <LockIcon data-icon="inline-start" />
            )}
            {locked ? "Unlock uploads" : "Lock uploads"}
          </Button>
          <UploadTrigger size="sm" />
        </div>
        <UploadDropzone />
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
