"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { useDelete } from "@dimah-s3/react";
import {
  Delete,
  DeleteToasts,
  FileAttachment,
  useDeleteContext,
  type DeleteTarget,
} from "@dimah-s3/ui";
import { Button } from "@/components/ui/button";

const FILES: DeleteTarget[] = [
  { objectKey: "uploads/e1/scan-001.pdf", fileName: "scan-001.pdf" },
  { objectKey: "uploads/e2/scan-002.pdf", fileName: "scan-002.pdf" },
  { objectKey: "uploads/e3/scan-003.pdf", fileName: "scan-003.pdf" },
];

export function DeleteBulkDemo() {
  const remove = useDelete({ route: "uploads" });
  const [files, setFiles] = useState(FILES);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Delete
        delete={remove}
        onDeleted={(result) =>
          setFiles((current) =>
            current.filter((file) => !result.deleted.includes(file.objectKey)),
          )
        }
      >
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.objectKey}>
              <FileAttachment state="done" fileName={file.fileName ?? ""} />
            </li>
          ))}
        </ul>
        {files.length > 0 ? (
          <DeleteAllButton targets={files} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setFiles(FILES)}>
            Restore the demo files
          </Button>
        )}
      </Delete>
      <DeleteToasts delete={remove} />
    </div>
  );
}

/** A trigger of your own: one confirm for every target. */
function DeleteAllButton({ targets }: { targets: DeleteTarget[] }) {
  const { request, delete: remove } = useDeleteContext();

  return (
    <Button
      variant="destructive"
      className="self-start"
      disabled={remove.isPending}
      onClick={(event) => request(targets, { trigger: event.currentTarget })}
    >
      <Trash2Icon data-icon="inline-start" />
      Delete all {targets.length} files
    </Button>
  );
}
