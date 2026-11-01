"use client";

import { DownloadIcon, FileDownIcon } from "lucide-react";
import { useDownload } from "@dimah-s3/react";
import { Download, DownloadToasts, DownloadTrigger } from "@dimah-s3/ui";

const KEY = "uploads/2c9a/price-list.pdf";

export function DownloadVariantsDemo() {
  // Signs a URL and hands it to the browser, which saves the file.
  const download = useDownload({ route: "uploads" });

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Download download={download}>
        <DownloadTrigger objectKey={KEY} fileName="price-list.pdf" />
        <DownloadTrigger
          objectKey={KEY}
          fileName="price-list.pdf"
          variant="default"
        />
        <DownloadTrigger
          objectKey={KEY}
          fileName="price-list.pdf"
          variant="secondary"
          size="sm"
        >
          <FileDownIcon data-icon="inline-start" />
          Price list (PDF)
        </DownloadTrigger>
        <DownloadTrigger
          objectKey={KEY}
          fileName="price-list.pdf"
          variant="link"
        >
          Download the price list
        </DownloadTrigger>
        <DownloadTrigger
          objectKey={KEY}
          fileName="price-list.pdf"
          variant="ghost"
          size="icon"
          aria-label="Download price-list.pdf"
          tooltip="Download"
        >
          <DownloadIcon />
        </DownloadTrigger>
      </Download>
      <DownloadToasts download={download} />
    </div>
  );
}
