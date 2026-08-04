import Link from "next/link";

export default function RegistryPlaceholderPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-600">
          ← Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold">shadcn registry</h1>
        <p className="text-sm text-zinc-500">
          Components installed into your codebase via the shadcn CLI — not the
          npm package.
        </p>
      </header>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This track is a placeholder. When ready, install from the{" "}
        <code>@dimah-s3</code> registry (see <code>components.json</code>):
      </p>

      <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
        {`pnpm dlx shadcn@latest add @dimah-s3/upload-dropzone
pnpm dlx shadcn@latest add @dimah-s3/upload-button
pnpm dlx shadcn@latest add @dimah-s3/download-button`}
      </pre>

      <p className="text-xs text-zinc-400">
        Live demos for the npm package are on{" "}
        <Link href="/ui" className="underline hover:text-zinc-600">
          /ui
        </Link>
        .
      </p>
    </main>
  );
}
