"use client";

import { useDownload } from "@dimah-s3/react";
import { ProgressDownloadButton } from "@dimah-s3/ui";

export function ProgressDownloadDemo() {
  const download = useDownload({ route: "uploads", mode: "fetch" });

  return (
    <ProgressDownloadButton
      className="w-fit self-start"
      download={download}
      objectKey="uploads/11111111-1111-1111-1111-111111111111/demo.mp4"
      fileName="Demo.mp4"
      fileSize={75 * 1024 * 1024}
    />
  );
}
