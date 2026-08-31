"use client";

import { useState } from "react";
import { UploadButton } from "@dimah-s3/ui";
import { FileList } from "@/components/file-list";

export default function Home() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">dimah-s3 + db</h1>
        <p className="mt-2 text-muted-foreground">
          Same as the Next.js starter, plus the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">db()</code>{" "}
          plugin
        </p>
      </div>

      <UploadButton
        route="uploads"
        label="Upload file"
        onSuccess={() => setRefreshToken((token) => token + 1)}
      />

      <section className="flex w-full max-w-sm flex-col gap-2">
        <h2 className="text-sm font-medium">Your files</h2>
        <FileList refreshToken={refreshToken} />
      </section>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Copy <code className="rounded bg-muted px-1 py-0.5">.env.example</code>{" "}
        to <code className="rounded bg-muted px-1 py-0.5">.env.local</code>, set{" "}
        <code className="rounded bg-muted px-1 py-0.5">S3_*</code>, then run{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm db:schema</code> and{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm db:push</code>.
      </p>
    </main>
  );
}
