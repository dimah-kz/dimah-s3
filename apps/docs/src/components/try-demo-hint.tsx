import { MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TryDemoHint({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-3 inset-e-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-fd-border/80 bg-fd-background/90 px-2.5 py-1 font-mono text-[0.6875rem] font-semibold tracking-wide text-fd-muted-foreground shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <MousePointer2 className="size-3 text-fd-primary" />
      Try it
    </div>
  );
}
