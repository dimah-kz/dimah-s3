"use client";

import { useEffect, useState } from "react";
import { s3Client } from "@/lib/s3-client";

type ListedObject = Awaited<
  ReturnType<(typeof s3Client)["db"]["listObjects"]>
>["objects"][number];

/** Browser listing via `dbClient()` — see /docs/db/api */
export function FileList({ refreshToken = 0 }: { refreshToken?: number }) {
  const api = s3Client.useApi();
  const [files, setFiles] = useState<ListedObject[]>([]);

  useEffect(() => {
    void api.db
      .listObjects({ status: "active", limit: 50, offset: 0 })
      .then((result) => setFiles(result.objects));
  }, [api, refreshToken]);

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files yet.</p>;
  }

  return (
    <ul className="list-inside list-disc text-sm">
      {files.map((file) => (
        <li key={file.id}>{file.filename ?? file.key}</li>
      ))}
    </ul>
  );
}
