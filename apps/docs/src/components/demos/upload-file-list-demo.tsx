"use client";

import { CheckIcon, XIcon } from "lucide-react";
import {
  useFormatFileSize,
  useUpload,
  type UploadFileState,
} from "@dimah-s3/react";
import {
  FileTypeGlyph,
  Upload,
  UploadFileList,
  UploadToasts,
  UploadTrigger,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

export function UploadFileListDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 5,
    maxFileSize: 75 * 1024 * 1024,
    queue: true,
  });
  const formatFileSize = useFormatFileSize();

  function status(file: UploadFileState) {
    switch (file.phase) {
      case "success":
        return <CheckIcon className="size-4 text-green-600" />;
      case "error":
        return <span className="text-destructive">Failed</span>;
      case "uploading":
        return `${file.progress.percent}%`;
      default:
        return "Waiting…";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3">
      <Upload upload={upload}>
        <UploadTrigger variant="outline" size="sm" />
        <UploadFileList className="gap-0 divide-y rounded-lg border">
          {(file) => (
            <div className="relative flex items-center gap-3 px-3 py-2 text-sm">
              <FileTypeGlyph
                layout="icon"
                fileName={file.fileName}
                contentType={file.contentType}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{file.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(file.fileSize)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {status(file)}
              </span>
              {file.phase === "uploading" || file.phase === "queued" ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Cancel ${file.fileName}`}
                  onClick={() => upload.cancel(file.id)}
                >
                  <XIcon />
                </Button>
              ) : null}
              {/* A thin bar along the bottom edge of the row. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-transform rtl:origin-right"
                style={{
                  transform: `scaleX(${file.phase === "uploading" ? file.progress.percent / 100 : 0})`,
                }}
              />
            </div>
          )}
        </UploadFileList>
      </Upload>
      <UploadToasts upload={upload} />
    </div>
  );
}
