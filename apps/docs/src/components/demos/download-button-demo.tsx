"use client";

import { DownloadButton } from "@dimah-s3/ui";

export function DownloadButtonDemo() {
  return (
    <DownloadButton
      objectKey="reports/annual-2024.pdf"
      fileName="Annual Report 2024.pdf"
    />
  );
}
