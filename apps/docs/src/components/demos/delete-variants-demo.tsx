"use client";

import { Trash2Icon } from "lucide-react";
import { useDelete } from "@dimah-s3/react";
import {
  Delete,
  DeleteConfirmDialog,
  DeleteToasts,
  DeleteTrigger,
} from "@dimah-s3/ui";

const FILE = {
  objectKey: "uploads/71ce/contract-signed.pdf",
  fileName: "contract-signed.pdf",
  fileSize: 2_400_000,
};

export function DeleteVariantsDemo() {
  const remove = useDelete({ route: "uploads" });

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {/* The default dialog names the file and its size. */}
      <Delete delete={remove}>
        <DeleteTrigger {...FILE} />
        <DeleteTrigger {...FILE} variant="outline" />
        <DeleteTrigger
          {...FILE}
          variant="ghost"
          size="icon"
          aria-label="Delete contract-signed.pdf"
          tooltip="Delete"
        >
          <Trash2Icon />
        </DeleteTrigger>
        <DeleteTrigger
          {...FILE}
          variant="outline"
          note="The signed copy is also kept by the client."
        >
          With a note
        </DeleteTrigger>
      </Delete>

      {/* Your own copy in the dialog. */}
      <Delete
        delete={remove}
        dialog={
          <DeleteConfirmDialog
            title="Remove the signed contract?"
            description="Both parties lose access to this copy."
            confirmLabel="Remove contract"
            cancelLabel="Keep it"
          />
        }
      >
        <DeleteTrigger {...FILE} variant="outline">
          Custom dialog
        </DeleteTrigger>
      </Delete>

      {/* No dialog: the delete starts on click. */}
      <Delete delete={remove} confirm={false}>
        <DeleteTrigger {...FILE} variant="outline">
          Without confirm
        </DeleteTrigger>
      </Delete>

      <DeleteToasts delete={remove} />
    </div>
  );
}
