"use client";

import { ProgressDownloadButton } from "@dimah-s3/ui";

export function ProgressDownloadDemo() {
  return (
    <ProgressDownloadButton
      className="w-fit self-start"
      route="uploads"
      objectKey="uploads/11111111-1111-1111-1111-111111111111/demo.mp4"
      fileName="Demo.mp4"
      fileSize={75 * 1024 * 1024}
    />
  );
}
