"use client";

import { ProgressDownloadButton } from "@dimah-s3/ui";

export function ProgressDownloadDemo() {
  return (
    <ProgressDownloadButton
      className="w-fit self-start"
      objectKey="videos/demo.mp4"
      fileName="Demo.mp4"
      fileSize={75 * 1024 * 1024}
    />
  );
}
