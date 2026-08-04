export function ExampleSection({
  title,
  badge,
  desc,
  code,
  children,
}: {
  title: string;
  badge?: string;
  desc?: React.ReactNode;
  code?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {badge && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {badge}
          </span>
        )}
      </div>
      {desc && (
        <p className="text-sm text-zinc-500 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:dark:bg-zinc-800">
          {desc}
        </p>
      )}
      {children}
      {code && (
        <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
          {code}
        </pre>
      )}
    </section>
  );
}
