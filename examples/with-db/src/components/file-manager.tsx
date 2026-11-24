"use client";

import { dbObjectSource, type DbClientObject } from "@dimah-s3/db/client";
import {
  useDelete,
  useDownload,
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
} from "@dimah-s3/ui";
import { useShareLinks } from "@dimah-s3/share/react";
import { ShareLinkDialog, shareTargetOf } from "@dimah-s3/ui/share";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { s3Client } from "@/lib/s3-client";

/**
 * Files and folders of the scope, from `storage_object` and
 * `storage_folder`. Uploads go to the open folder; usage and its caps come
 * from the server's `quota`. Each row's menu adds Share, which opens the
 * row's share links in `ShareLinkDialog`.
 */
export function FileManager() {
  const api = s3Client.useApi();
  const [sharing, setSharing] = useState<ObjectListEntry<DbClientObject>>();
  // The row's links, loaded each time its dialog opens.
  const links = useShareLinks(
    api.share,
    sharing ? shareTargetOf(sharing) : null,
  );
  const list = useObjectList({
    ...dbObjectSource(api.db, { route: "files" }),
    queryKey: ["files"],
    defaultSort: { field: "updatedAt", direction: "desc" },
  });
  const selection = useObjectListSelection(list);
  const upload = useUpload({ route: "files", maxFiles: 20, append: true });
  const download = useDownload({ route: "files" });
  const del = useDelete({ route: "files" });

  return (
    <>
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
                label: "Share",
                icon: <Share2 />,
                onClick: () => setSharing(entry),
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
      <ShareLinkDialog
        links={links}
        name={sharing?.name}
        open={sharing !== undefined}
        onOpenChange={(open) => {
          if (!open) setSharing(undefined);
        }}
      />
    </>
  );
}
