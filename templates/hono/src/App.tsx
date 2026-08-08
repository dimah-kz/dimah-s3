import { UploadButton } from "@dimah-s3/ui";

export function App() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">dimah-s3</h1>
        <p className="mt-2 text-muted-foreground">
          Hono starter — pick a file to upload to your bucket
        </p>
      </div>

      <UploadButton
        objectKey={(file) => `uploads/${Date.now()}-${file.name}`}
        accept={["image/*", ".pdf"]}
        maxFileSize={10 * 1024 * 1024}
        label="Upload file"
      />

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Copy <code className="rounded bg-muted px-1 py-0.5">.env.example</code>{" "}
        to <code className="rounded bg-muted px-1 py-0.5">.env</code> and set
        your <code className="rounded bg-muted px-1 py-0.5">S3_*</code> values.
        Browser uploads need bucket CORS.
      </p>
    </main>
  );
}
