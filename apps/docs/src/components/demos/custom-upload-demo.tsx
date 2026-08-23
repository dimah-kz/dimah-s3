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
  const { open, phase, progress, error, fileInfo, getInputProps } = useUpload({
    objectKey: "uploads/photo.jpg",
    maxFileSize: 75 * 1024 * 1024,
    noDrag: true,
    noClick: true,
    noKeyboard: true,
  });

  const busy =
    phase === "uploading" ||
    phase === "presigning" ||
    phase === "validating" ||
    phase === "finalizing";

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <input {...getInputProps()} />
      <Button type="button" size="sm" onClick={() => open()}>
        Choose file
      </Button>

      {phase !== "idle" ? (
        <Attachment state={attachmentState(phase)} size="sm">
          <AttachmentMedia>
            {busy ? <LoaderIcon className="animate-spin" /> : <FileIcon />}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{fileInfo?.name ?? "Uploading…"}</AttachmentTitle>
            <AttachmentDescription>
              {phase === "error"
                ? (error?.message ?? "Upload failed")
                : phase === "uploading"
                  ? `${progress.percent}%`
                  : "Preparing…"}
            </AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ) : null}
    </div>
  );
}
