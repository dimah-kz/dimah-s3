"use client";

import { useState, type FormEvent } from "react";
import { useUpload } from "@dimah-s3/react";
import {
  UploadDropzone,
  UploadField,
  UploadFieldValue,
  UploadToasts,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

const MAX_FILES = 3;

export function UploadFieldDemo() {
  const upload = useUpload({
    route: "uploads",
    maxFiles: MAX_FILES,
    maxFileSize: 75 * 1024 * 1024,
  });
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitted(form.getAll("attachments").map(String));
  }

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-3"
      onSubmit={onSubmit}
    >
      <UploadField upload={upload} name="attachments" maxFiles={MAX_FILES}>
        {/* Progress shows inside the dropzone; the value lists the keys. */}
        <UploadDropzone />
        <UploadFieldValue />
      </UploadField>
      <UploadToasts upload={upload} />
      <Button type="submit" className="w-fit" disabled={upload.isPending}>
        Submit
      </Button>
      {submitted ? (
        <output className="text-sm break-all text-muted-foreground">
          {submitted.length > 0
            ? `attachments: ${submitted.join(", ")}`
            : "No files attached."}
        </output>
      ) : null}
    </form>
  );
}
