import { Caveat } from "next/font/google";
import { cn } from "@/lib/utils";

const tryIt = Caveat({
  subsets: ["latin"],
  weight: "600",
});

export function TryDemoHint({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 flex flex-col items-end",
        "-top-14 inset-e-1 md:-top-3 md:-inset-e-8",
        className,
      )}
    >
      <span
        className={cn(
          tryIt.className,
          "-rotate-12 text-[1.85rem] leading-none text-fd-primary",
        )}
      >
        Try it
      </span>
      <div className="try-demo-nudge me-1 mt-0.5">
        <svg
          viewBox="0 0 72 70"
          fill="none"
          className="size-16 text-fd-primary rtl:-scale-x-100"
        >
          <path
            d="M54 7c11 11 14 29-3 43-9 7-25 11-41 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M16 44c-3.5 5-7 8.5-11 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M15 56c4.5.2 10 1.2 15 4.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
