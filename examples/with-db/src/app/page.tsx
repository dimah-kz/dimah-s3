"use client";

import { useState } from "react";
import { UploadButton } from "@dimah-s3/ui";
import { FileList } from "@/components/file-list";

export default function Page() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">dimah-s3 + db</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quickstart setup with the <code className="text-xs">db()</code> plugin
          — uploads sync to <code className="text-xs">storage_object</code>.
        </p>
      </div>

      <UploadButton
        objectKey={(file) => `uploads/${Date.now()}-${file.name}`}
        accept={["image/*", ".pdf"]}
        maxFileSize={10 * 1024 * 1024}
        label="Upload file"
        onSuccess={() => setRefreshToken((token) => token + 1)}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Your files</h2>
        <FileList refreshToken={refreshToken} />
      </section>
    </main>
  );
}
