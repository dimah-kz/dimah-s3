"use client";

import { dbObjectSource } from "@dimah-s3/db/client";
import {
  useDelete,
  useDownload,
  useObjectList,
  useObjectListSelection,
  useUpload,
} from "@dimah-s3/react";
import {
  ObjectList,
  ObjectListContent,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
  ObjectListUploadStatus,
  ObjectListUsage,
  ObjectListViewToggle,
  UploadTrigger,
} from "@dimah-s3/ui";
import { s3Client } from "@/lib/s3-client";

/**
 * Files and folders of the scope, from `storage_object` and
 * `storage_folder`. Uploads go to the open folder; usage and its caps come
 * from the server's `quota`.
 */
export function FileManager() {
  const api = s3Client.useApi();
  const list = useObjectList({
    ...dbObjectSource(api.db, { route: "files" }),
    queryKey: ["files"],
    defaultSort: { field: "updatedAt", direction: "desc" },
  });
  const selection = useObjectListSelection(list);
  const upload = useUpload({ route: "files", maxFiles: 20, queue: true });
  const download = useDownload({ route: "files" });
  const del = useDelete({ route: "files" });

  return (
    <ObjectList
      list={list}
      selection={selection}
      upload={upload}
      download={download}
      delete={del}
      height="32rem"
    >
      <ObjectListHeader>
        <ObjectListSearch className="max-sm:hidden" />
        <ObjectListSortMenu />
        <ObjectListViewToggle />
        <UploadTrigger size="sm" />
      </ObjectListHeader>
      <ObjectListUsage />
      <ObjectListUploadStatus />
      <ObjectListContent />
    </ObjectList>
  );
}
