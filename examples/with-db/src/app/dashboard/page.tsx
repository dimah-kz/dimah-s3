"use client";

import * as React from "react";
import { UploadDropzone } from "@dimah-s3/ui";
import { StorageObjectList } from "@/components/storage-object-list";

export default function Page() {
  const [refreshToken, setRefreshToken] = React.useState(0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Upload + DB</h1>
        <p className="text-sm text-muted-foreground">
          Schema: <code className="text-xs">storage_object</code> via{" "}
          <code className="text-xs">@dimah-s3/db</code> — lifecycle hooks keep
          the table in sync with S3.
        </p>
      </header>
      <UploadDropzone
        objectKey={(file) => `uploads/${Date.now()}-${file.name}`}
        multipart
        className="max-w-lg"
        onSuccess={() => setRefreshToken((token) => token + 1)}
      />
      <StorageObjectList refreshToken={refreshToken} />
    </main>
  );
}
