"use client";

import { FileAttachment, StatusAttachment } from "@dimah-s3/ui";

export function AttachmentStatesDemo() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 sm:grid-cols-2">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          FileAttachment
        </h3>
        <FileAttachment
          state="idle"
          fileName="waiting-in-queue.pdf"
          fileSize={1_200_000}
          onCancel={() => {}}
        />
        <FileAttachment
          state="uploading"
          fileName="holiday-video.mp4"
          contentType="video/mp4"
          fileSize={48_000_000}
          percent={62}
          description="48 MB · 9s left"
          onCancel={() => {}}
        />
        <FileAttachment
          state="processing"
          fileName="dataset.csv"
          description="Finishing…"
        />
        <FileAttachment
          state="done"
          fileName="avatar.png"
          contentType="image/png"
          previewUrl="/dimah-avatar.png"
          fileSize={180_000}
          onDismiss={() => {}}
        />
        <FileAttachment
          state="error"
          fileName="too-large-archive.zip"
          error="The file is larger than the 75 MB limit."
          onDismiss={() => {}}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          StatusAttachment
        </h3>
        <StatusAttachment state="processing" title="Preparing 4 files…" />
        <StatusAttachment
          state="done"
          title="All 4 files uploaded"
          description="12.6 MB"
          onDismiss={() => {}}
        />
        <StatusAttachment
          state="error"
          title="Upload failed"
          description="2 of 4 files could not be uploaded."
          onDismiss={() => {}}
        />
      </section>
    </div>
  );
}
