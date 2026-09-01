"use client";

import { useUpload, type UploadPhase } from "@dimah-s3/react";
import { FileIcon, LoaderIcon } from "lucide-react";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";

function attachmentState(phase: UploadPhase) {
  if (phase === "uploading") return "uploading" as const;
  if (phase === "error") return "error" as const;
  if (phase === "success") return "done" as const;
  return "processing" as const;
}

/** Headless upload + stock shadcn Attachment from the docs app. */
export function CustomUploadDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFileSize: 75 * 1024 * 1024,
    noDrag: true,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <input {...upload.getInputProps()} />
      <Button type="button" size="sm" onClick={() => upload.open()}>
        Choose file
      </Button>

      {upload.phase !== "idle" ? (
        <Attachment state={attachmentState(upload.phase)} size="sm">
          <AttachmentMedia>
            {upload.isPending ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <FileIcon />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>
              {upload.file?.name ?? "Uploading…"}
            </AttachmentTitle>
            <AttachmentDescription>
              {upload.phase === "error"
                ? (upload.error?.message ?? "Upload failed")
                : upload.phase === "uploading"
                  ? `${upload.progress.percent}%`
                  : "Preparing…"}
            </AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ) : null}
    </div>
  );
}
