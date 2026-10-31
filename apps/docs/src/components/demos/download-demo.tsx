"use client";

import { useDownload, useFetchDownload } from "@dimah-s3/react";
import {
  Download,
  DownloadProgress,
  DownloadToasts,
  DownloadTrigger,
} from "@dimah-s3/ui";

const OBJECT_KEY = "avatar/11111111-1111-1111-1111-111111111111/avatar.png";

export function DownloadDemo() {
  // Hands a signed URL to the browser.
  const download = useDownload({ route: "avatar" });
  // Fetches the bytes with progress, then saves them.
  const fetchDownload = useFetchDownload({ route: "avatar" });

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-start gap-3">
      <Download download={download}>
        <DownloadTrigger objectKey={OBJECT_KEY} fileName="avatar.png" />
      </Download>
      <Download download={fetchDownload}>
        <DownloadTrigger
          variant="outline"
          objectKey={OBJECT_KEY}
          fileName="avatar.png"
          fileSize={2 * 1024 * 1024}
        >
          Download with progress
        </DownloadTrigger>
        <DownloadProgress objectKey={OBJECT_KEY} className="w-full" />
      </Download>
      <DownloadToasts download={download} />
      <DownloadToasts download={fetchDownload} />
    </div>
  );
}
