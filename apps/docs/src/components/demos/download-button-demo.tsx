"use client";

import { useDownload } from "@dimah-s3/react";
import { DownloadButton } from "@dimah-s3/ui";

export function DownloadButtonDemo() {
  const download = useDownload({ route: "uploads" });

  return (
    <DownloadButton
      className="w-fit self-start"
      download={download}
      objectKey="uploads/11111111-1111-1111-1111-111111111111/annual-2024.pdf"
      fileName="Annual Report 2024.pdf"
    />
  );
}
