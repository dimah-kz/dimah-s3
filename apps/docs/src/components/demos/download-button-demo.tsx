"use client";

import { DownloadButton } from "@dimah-s3/ui";

export function DownloadButtonDemo() {
  return (
    <DownloadButton
      className="w-fit self-start"
      route="uploads"
      objectKey="uploads/11111111-1111-1111-1111-111111111111/annual-2024.pdf"
      fileName="Annual Report 2024.pdf"
    />
  );
}
