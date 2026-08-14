import { cn } from "@/lib/cn";

export type FlowKind = "hook" | "server" | "s3" | "client";

export type FlowStep = {
  name: string;
  kind?: FlowKind;
  note?: string;
};

const KIND_LABEL: Record<FlowKind, string> = {
  hook: "hook",
  server: "server",
  s3: "S3",
  client: "client",
};

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn(
        "size-4 shrink-0 justify-self-center self-center text-fd-muted-foreground/45",
        "my-1 rotate-90 @sm:mx-0.5 @sm:my-0 @sm:rotate-0 @sm:rtl:rotate-180",
        className,
      )}
    >
      <path
        d="M4 12h14M14 7l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Flow({
  steps,
  label = "Flow",
}: {
  steps: FlowStep[];
  label?: string;
}) {
  const wide = steps.length > 2;

  return (
    <figure className="@container not-prose my-6 rounded-xl border bg-fd-muted/40 p-4">
      <figcaption className="mb-3 text-xs font-medium text-fd-muted-foreground">
        {label}
      </figcaption>
      <ol
        aria-label={label}
        className={cn(
          "m-0 grid list-none grid-cols-1 items-stretch gap-y-0 p-0 @sm:gap-y-3",
          wide
            ? "@sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
            : "@sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
        )}
      >
        {steps.map((step, index) => {
          const kind = step.kind ?? "hook";
          const isHook = kind === "hook";
          const caption = step.note ?? KIND_LABEL[kind];
          const isLast = index === steps.length - 1;
          const endOfRow = wide && (index + 1) % 3 === 0;

          return (
            <li key={`${step.name}-${index}`} className="contents">
              <div
                className={cn(
                  "flex min-h-14 min-w-0 flex-col justify-center gap-1 rounded-lg px-3.5 py-3 ring-1 ring-fd-foreground/8",
                  isHook ? "bg-fd-primary/12" : "bg-fd-card",
                )}
              >
                <span
                  className={cn(
                    "text-sm leading-tight",
                    isHook
                      ? "font-mono text-fd-foreground"
                      : "font-medium text-fd-foreground",
                  )}
                >
                  {step.name}
                </span>
                <span className="text-[11px] leading-tight text-fd-muted-foreground">
                  {caption}
                </span>
              </div>
              {isLast ? null : (
                <Arrow className={endOfRow ? "@sm:hidden" : undefined} />
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
