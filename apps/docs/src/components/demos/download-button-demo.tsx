"use client";

import { useDownload } from "@dimah-s3/react";
import { DownloadButton } from "@dimah-s3/ui";

export function DownloadButtonDemo() {
  const download = useDownload({ route: "avatar" });

  return (
    <DownloadButton
      className="w-fit self-start"
      download={download}
      objectKey="avatar/11111111-1111-1111-1111-111111111111/avatar.png"
      fileName="avatar.png"
    />
  );
}
