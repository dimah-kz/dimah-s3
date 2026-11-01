"use client";

import { useState } from "react";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useDelete } from "@dimah-s3/react";
import {
  Delete,
  DeleteToasts,
  DeleteTrigger,
  FileAttachment,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

const FILES = [
  {
    key: "uploads/4d1e/meeting-notes.docx",
    name: "meeting-notes.docx",
    size: 48_000,
  },
  { key: "uploads/8a7c/old-logo.png", name: "old-logo.png", size: 220_000 },
  { key: "uploads/b6f0/draft-v1.pdf", name: "draft-v1.pdf", size: 1_350_000 },
];

export function DeleteDemo() {
  const remove = useDelete({ route: "uploads" });
  const [files, setFiles] = useState(FILES);

  return (
    <div className="mx-auto w-full max-w-md">
      <Delete
        delete={remove}
        onDeleted={(result) =>
          setFiles((current) =>
            current.filter((file) => !result.deleted.includes(file.key)),
          )
        }
      >
        {files.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {files.map((file) => (
              <li key={file.key}>
                <FileAttachment
                  state="done"
                  fileName={file.name}
                  fileSize={file.size}
                  actions={
                    <DeleteTrigger
                      objectKey={file.key}
                      fileName={file.name}
                      fileSize={file.size}
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${file.name}`}
                      tooltip="Delete"
                    >
                      <Trash2Icon />
                    </DeleteTrigger>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            All files deleted.
            <Button variant="outline" size="sm" onClick={() => setFiles(FILES)}>
              <RotateCcwIcon data-icon="inline-start" />
              Restore the demo files
            </Button>
          </div>
        )}
      </Delete>
      <DeleteToasts delete={remove} />
    </div>
  );
}
