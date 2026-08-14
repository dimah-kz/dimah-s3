import { cn } from "@/lib/cn";

export type FlowKind = "hook" | "server" | "s3" | "client";

export type FlowStep = {
  name: string;
  kind?: FlowKind;
  note?: string;
};

function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="mx-1.5 size-3 shrink-0 self-center text-fd-muted-foreground/50 rtl:rotate-180"
    >
      <path
        d="M2.5 8h11M9.5 4.5 13.5 8l-4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
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
  return (
    <figure className="not-prose my-5">
      <ol
        aria-label={label}
        className="m-0 flex list-none flex-wrap items-baseline gap-y-0.5 p-0 text-[13px] leading-7"
      >
        {steps.map((step, index) => {
          const isHook = (step.kind ?? "hook") === "hook";

          return (
            <li key={`${step.name}-${index}`} className="flex items-baseline">
              <span
                className={cn(
                  isHook
                    ? "font-mono text-fd-foreground"
                    : "text-fd-muted-foreground",
                )}
              >
                {step.name}
                {step.note ? (
                  <span className="ms-1 font-sans text-fd-muted-foreground/80">
                    {step.note}
                  </span>
                ) : null}
              </span>
              {index < steps.length - 1 ? <Arrow /> : null}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
