import Link from "next/link";
import { KeyRound } from "lucide-react";
import { docsRoute } from "@/lib/shared";
import { cn } from "@/lib/utils";

export function HomeAnnouncement({ className }: { className?: string }) {
  return (
    <Link
      href={docsRoute}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-fd-border/80 bg-fd-background/70 py-1 pe-3 ps-1 text-sm font-medium tracking-wide text-fd-muted-foreground shadow-sm backdrop-blur-sm transition-[border-color,color,transform] hover:-translate-y-0.5 hover:border-fd-foreground/20 hover:text-fd-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transform-none",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-full border border-fd-border/80 bg-fd-muted/70 text-fd-primary">
        <KeyRound className="size-3.5" aria-hidden />
      </span>
      Bring your own AWS SDK{" "}
      <code className="font-mono text-[0.8125rem] font-semibold tracking-normal text-fd-foreground">
        S3Client
      </code>
    </Link>
  );
}
