import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">dimah-s3</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          Next.js example — presigned upload, download &amp; delete
        </p>
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-3">
        <NavLink
          href="/ui"
          title="@dimah-s3/ui"
          desc="npm package — live component demos"
        />
        <NavLink
          href="/registry"
          title="shadcn registry"
          desc="placeholder — install components via CLI"
        />
      </nav>

      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Requires S3-compatible storage — copy <code>.env.example</code> to{" "}
        <code>.env</code>
      </p>
    </main>
  );
}

function NavLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <span className="font-medium">{title}</span>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{desc}</span>
    </Link>
  );
}
