"use client";

import { ProgressDownloadButton } from "@dimah-s3/ui";

export function ProgressDownloadDemo() {
  return (
    <ProgressDownloadButton
      objectKey="videos/demo.mp4"
      fileName="Demo.mp4"
      fileSize={40_000_000}
    />
  );
}
