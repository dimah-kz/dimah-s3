import { FileManager } from "@/components/file-manager";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">dimah-s3 + db</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A file manager on the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">db()</code>{" "}
          plugin. Drop files onto the list or a folder, create folders, search,
          sort, download, and delete.
        </p>
      </div>

      <FileManager />

      <p className="text-xs text-muted-foreground">
        Copy <code className="rounded bg-muted px-1 py-0.5">.env.example</code>{" "}
        to <code className="rounded bg-muted px-1 py-0.5">.env</code>, set{" "}
        <code className="rounded bg-muted px-1 py-0.5">S3_*</code> and{" "}
        <code className="rounded bg-muted px-1 py-0.5">DIMAH_S3_SECRET</code>,
        then run{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm db:push</code>.
        Browser uploads need bucket CORS.
      </p>
    </main>
  );
}
