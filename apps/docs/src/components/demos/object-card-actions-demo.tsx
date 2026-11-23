"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { useDownload } from "@dimah-s3/react";
import { AttachmentAction, DownloadToasts, ObjectCard } from "@dimah-s3/ui";

const KEY = "uploads/2c9a/price-list.pdf";

export function ObjectCardActionsDemo() {
  const download = useDownload({ route: "uploads" });
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    // Signs a URL without saving the file.
    const outcome = await download.presign(KEY);
    if (outcome.status !== "success") return;
    await navigator.clipboard.writeText(outcome.data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <ObjectCard
        objectKey={KEY}
        fileSize={512_000}
        contentType="application/pdf"
        description="Updated Oct 30 · 500 KB"
        download={download}
        actions={
          <AttachmentAction
            aria-label="Copy link to price-list.pdf"
            onClick={() => void copyLink()}
          >
            {copied ? <CheckIcon /> : <LinkIcon />}
          </AttachmentAction>
        }
      />
      <DownloadToasts download={download} />
    </div>
  );
}
