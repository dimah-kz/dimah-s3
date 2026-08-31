"use client";

import { useCallback, useEffect, useState } from "react";
import type { DbClientObject } from "@dimah-s3/db/client";
import { DeleteButton, DownloadButton } from "@dimah-s3/ui";
import { s3Client } from "@/lib/s3-client";

/** Browser listing via `api.db.listObjects` — see /docs/db/api */
export function FileList({ refreshToken = 0 }: { refreshToken?: number }) {
  const api = s3Client.useApi();
  const [objects, setObjects] = useState<DbClientObject[]>([]);

  const refresh = useCallback(async () => {
    const page = await api.db.listObjects({ route: "uploads" });
    setObjects(page.objects);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  if (objects.length === 0) {
    return <p className="text-sm text-muted-foreground">No files</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {objects.map((object) => {
        const fileName = object.filename ?? object.key;
        return (
          <li
            key={object.id}
            className="flex w-full min-w-0 items-center gap-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{fileName}</span>
            <DownloadButton
              api={api}
              route="uploads"
              objectKey={object.key}
              fileName={fileName}
              size="sm"
              status={false}
            />
            <DeleteButton
              api={api}
              route="uploads"
              objectKey={object.key}
              fileName={fileName}
              fileSize={object.size ?? undefined}
              size="sm"
              status={false}
              onSuccess={() => void refresh()}
            />
          </li>
        );
      })}
    </ul>
  );
}
