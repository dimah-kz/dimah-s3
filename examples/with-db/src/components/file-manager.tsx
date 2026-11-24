"use client";

import { dbObjectSource, type DbClientObject } from "@dimah-s3/db/client";
import {
  useDelete,
  useDownload,
  useFormatError,
  useObjectList,
  useObjectListSelection,
  useUpload,
  type ObjectListEntry,
} from "@dimah-s3/react";
import {
  ObjectList,
  ObjectListContent,
  ObjectListEntryMenu,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
  ObjectListUploadStatus,
  ObjectListUsage,
  ObjectListViewToggle,
  UploadTrigger,
  toast,
} from "@dimah-s3/ui";
import { Share2 } from "lucide-react";
import { s3Client } from "@/lib/s3-client";

/**
 * Files and folders of the scope, from `storage_object` and
 * `storage_folder`. Uploads go to the open folder; usage and its caps come
 * from the server's `quota`. Each row's menu adds Share link, which creates
 * a 7-day link with `api.share.createLink` and copies it.
 */
export function FileManager() {
  const api = s3Client.useApi();
  const formatError = useFormatError();
  const list = useObjectList({
    ...dbObjectSource(api.db, { route: "files" }),
    queryKey: ["files"],
    defaultSort: { field: "updatedAt", direction: "desc" },
  });
  const selection = useObjectListSelection(list);
  const upload = useUpload({ route: "files", maxFiles: 20, append: true });
  const download = useDownload({ route: "files" });
  const del = useDelete({ route: "files" });

  const shareEntry = async (entry: ObjectListEntry<DbClientObject>) => {
    try {
      const { link } = await api.share.createLink({
        target:
          entry.kind === "file"
            ? { type: "object", key: entry.item.key, bucket: entry.item.bucket }
            : { type: "folder", folderId: entry.id },
      });
      // `share({ url })` returns `/s/<token>`; copy it with this origin.
      const url = new URL(link.url ?? `/s/${link.token}`, window.location.href);
      await navigator.clipboard.writeText(url.href);
      toast.add({
        type: "success",
        title: "Share link copied",
        description: link.expiresAt
          ? `It opens until ${new Date(link.expiresAt).toLocaleDateString()}.`
          : "It never expires.",
      });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not share",
        description: formatError(error),
        priority: "high",
      });
    }
  };

  return (
    <ObjectList
      list={list}
      selection={selection}
      upload={upload}
      download={download}
      delete={del}
      height="32rem"
      renderActions={(entry) => (
        <ObjectListEntryMenu
          actions={[
            {
              label: "Share link",
              icon: <Share2 />,
              onClick: () => void shareEntry(entry),
            },
          ]}
        />
      )}
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
