"use client";

import { useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { useDelete, useFetchDownload } from "@dimah-s3/react";
import { DeleteToasts, DownloadToasts, ObjectCard } from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

const FILES = [
  {
    key: "uploads/3f1a/quarterly-report.pdf",
    size: 8 * 1024 * 1024,
    type: "application/pdf",
  },
  {
    key: "uploads/9b2e/brand-assets.zip",
    size: 24 * 1024 * 1024,
    type: "application/zip",
  },
  {
    key: "uploads/c47d/avatar.png",
    size: 180_000,
    type: "image/png",
    previewUrl: "/dimah-avatar.png",
  },
];

export function ObjectCardDemo() {
  const download = useFetchDownload({ route: "uploads" });
  const remove = useDelete({ route: "uploads" });
  const [files, setFiles] = useState(FILES);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2">
      {files.map((file) => (
        <ObjectCard
          key={file.key}
          objectKey={file.key}
          fileSize={file.size}
          contentType={file.type}
          previewUrl={file.previewUrl}
          download={download}
          delete={remove}
          onDeleted={(result) =>
            setFiles((current) =>
              current.filter((item) => !result.deleted.includes(item.key)),
            )
          }
        />
      ))}
      {files.length < FILES.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => setFiles(FILES)}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Restore the demo files
        </Button>
      ) : null}
      <DownloadToasts download={download} />
      <DeleteToasts delete={remove} />
    </div>
  );
}
