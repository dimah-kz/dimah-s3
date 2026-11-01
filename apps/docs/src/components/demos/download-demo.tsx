"use client";

import { DownloadIcon } from "lucide-react";
import { useFetchDownload } from "@dimah-s3/react";
import {
  Download,
  DownloadToasts,
  DownloadTrigger,
  FileAttachment,
} from "@dimah-s3/ui";

const FILES = [
  {
    key: "uploads/3f1a/quarterly-report.pdf",
    name: "quarterly-report.pdf",
    type: "application/pdf",
    size: 8 * 1024 * 1024,
  },
  {
    key: "uploads/9b2e/brand-assets.zip",
    name: "brand-assets.zip",
    type: "application/zip",
    size: 24 * 1024 * 1024,
  },
  {
    key: "uploads/c47d/launch-video.mp4",
    name: "launch-video.mp4",
    type: "video/mp4",
    size: 16 * 1024 * 1024,
  },
];

export function DownloadDemo() {
  // Fetches the bytes in the page, with progress and cancel.
  const download = useFetchDownload({ route: "uploads" });

  return (
    <div className="mx-auto w-full max-w-md">
      <Download download={download}>
        <ul className="flex flex-col gap-2">
          {FILES.map((file) => (
            <li key={file.key}>
              <FileAttachment
                state="done"
                fileName={file.name}
                fileSize={file.size}
                contentType={file.type}
                actions={
                  <DownloadTrigger
                    objectKey={file.key}
                    fileName={file.name}
                    fileSize={file.size}
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Download ${file.name}`}
                    tooltip="Download"
                  >
                    <DownloadIcon />
                  </DownloadTrigger>
                }
              />
            </li>
          ))}
        </ul>
      </Download>
      <DownloadToasts download={download} />
    </div>
  );
}
