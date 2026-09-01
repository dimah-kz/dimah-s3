"use client";

import { useCallback, useEffect, useState } from "react";
import type { DbClientObject } from "@dimah-s3/db/client";
import {
  useDelete,
  useDownload,
  type UseDeleteReturn,
  type UseNavigateDownloadReturn,
} from "@dimah-s3/react";
import { DeleteButton, DownloadButton } from "@dimah-s3/ui";
import { s3Client } from "@/lib/s3-client";

function FileRow({
  object,
  download,
  del,
}: {
  object: DbClientObject;
  download: UseNavigateDownloadReturn;
  del: UseDeleteReturn;
}) {
  const fileName = object.filename ?? object.key;

  return (
    <li className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{fileName}</span>
      <DownloadButton
        download={download}
        objectKey={object.key}
        fileName={fileName}
        size="sm"
        status={false}
      />
      <DeleteButton
        delete={del}
        objectKey={object.key}
        fileName={fileName}
        fileSize={object.size ?? undefined}
        size="sm"
        status={false}
      />
    </li>
  );
}

/** Browser listing via `api.db.listObjects` — see /docs/db/api */
export function FileList({ refreshToken = 0 }: { refreshToken?: number }) {
  const api = s3Client.useApi();
  const [objects, setObjects] = useState<DbClientObject[]>([]);

  const refresh = useCallback(async () => {
    const page = await api.db.listObjects({ route: "avatar" });
    setObjects(page.objects);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const download = useDownload({ route: "avatar" });
  const del = useDelete({ route: "avatar", onSuccess: () => void refresh() });

  if (objects.length === 0) {
    return <p className="text-sm text-muted-foreground">No files</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {objects.map((object) => (
        <FileRow
          key={object.id}
          object={object}
          download={download}
          del={del}
        />
      ))}
    </ul>
  );
}
