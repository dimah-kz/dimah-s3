"use client";

import { useUpload, type UploadFileState } from "@dimah-s3/react";
import { FileIcon, LoaderIcon } from "lucide-react";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";

function attachmentState(file: UploadFileState) {
  if (file.phase === "uploading") return "uploading" as const;
  if (file.phase === "error") return "error" as const;
  if (file.phase === "success") return "done" as const;
  return "processing" as const;
}

function describe(file: UploadFileState) {
  if (file.phase === "error") return file.error?.message ?? "Upload failed";
  if (file.phase === "success") return "Uploaded";
  if (file.phase === "uploading") return `${file.progress.percent}%`;
  return "Preparing…";
}

/** Headless upload + stock shadcn Attachment from the docs app. */
export function CustomUploadDemo() {
  const upload = useUpload({
    route: "avatar",
    maxFileSize: 75 * 1024 * 1024,
  });
  const { file } = upload;

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <input {...upload.getInputProps()} />
      <Button type="button" size="sm" onClick={() => upload.open()}>
        Choose file
      </Button>

      {file ? (
        <Attachment state={attachmentState(file)} size="sm">
          <AttachmentMedia>
            {upload.isPending ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <FileIcon />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{file.fileName}</AttachmentTitle>
            <AttachmentDescription>{describe(file)}</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ) : null}
    </div>
  );
}
