"use client";

import { useDownload } from "@dimah-s3/react";
import { ProgressDownloadButton } from "@dimah-s3/ui";

export function ProgressDownloadDemo() {
  const download = useDownload({ route: "avatar", mode: "fetch" });

  return (
    <ProgressDownloadButton
      className="w-fit self-start"
      download={download}
      objectKey="avatar/11111111-1111-1111-1111-111111111111/avatar.png"
      fileName="avatar.png"
      fileSize={2 * 1024 * 1024}
    />
  );
}
