"use client";

import { useFetchDownload } from "@dimah-s3/react";
import {
  Download,
  DownloadProgress,
  DownloadToasts,
  DownloadTrigger,
} from "@dimah-s3/ui";

const REPORT = {
  key: "uploads/5e8b/annual-report-2026.pdf",
  name: "annual-report-2026.pdf",
  size: 18 * 1024 * 1024,
};

export function DownloadProgressDemo() {
  const download = useFetchDownload({ route: "uploads" });

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-start gap-3">
      <Download download={download}>
        {/* While the file downloads, the button fills and turns into Cancel. */}
        <DownloadTrigger
          objectKey={REPORT.key}
          fileName={REPORT.name}
          fileSize={REPORT.size}
        >
          Download annual report
        </DownloadTrigger>
        <DownloadProgress objectKey={REPORT.key} />
      </Download>
      <DownloadToasts download={download} />
    </div>
  );
}
