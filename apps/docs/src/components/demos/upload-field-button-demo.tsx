"use client";

import { useState, type FormEvent } from "react";
import { PaperclipIcon } from "lucide-react";
import { useUpload } from "@dimah-s3/react";
import {
  UploadField,
  UploadFieldValue,
  UploadStatus,
  UploadToasts,
  UploadTrigger,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

/** Keys saved with the ticket earlier. They show without an upload. */
const SAVED_KEYS = ["uploads/7f3c2a90/invoice-0042.pdf"];

export function UploadFieldButtonDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: 3,
    maxFileSize: 75 * 1024 * 1024,
  });
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitted(form.getAll("files").map(String));
  }

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-xl border p-4"
      onSubmit={onSubmit}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Message
        <textarea
          name="message"
          rows={3}
          defaultValue="The invoice total looks wrong."
          className="rounded-md border bg-transparent px-3 py-2 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <UploadField
        upload={upload}
        name="files"
        maxFiles={3}
        defaultValue={SAVED_KEYS}
      >
        <UploadFieldValue />
        <UploadStatus />
        <div className="flex items-center justify-between gap-2">
          <UploadTrigger variant="ghost" size="sm">
            <PaperclipIcon data-icon="inline-start" />
            Attach files
          </UploadTrigger>
          <Button type="submit" size="sm" disabled={upload.isPending}>
            Send
          </Button>
        </div>
      </UploadField>
      <UploadToasts upload={upload} />
      {submitted ? (
        <output className="text-xs break-all text-muted-foreground">
          files: {submitted.join(", ") || "none"}
        </output>
      ) : null}
    </form>
  );
}
