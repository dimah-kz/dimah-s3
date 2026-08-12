"use client";

import { useUpload } from "@dimah-s3/react";
import { UploadStatus } from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

/** Headless upload trigger + shared Attachment status row. */
export function CustomUploadDemo() {
  const { open, phase, progress, error, fileInfo, cancel, getInputProps } =
    useUpload({
      objectKey: (file) => `demo/${Date.now()}-${file.name}`,
      maxFileSize: 25 * 1024 * 1024,
      noDrag: true,
      noClick: true,
      noKeyboard: true,
    });

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <input {...getInputProps()} />
      <Button type="button" size="sm" onClick={() => open()}>
        Choose file
      </Button>
      <UploadStatus
        phase={phase}
        progress={progress}
        error={error}
        fileInfo={fileInfo}
        onCancel={cancel}
        size="sm"
      />
    </div>
  );
}
