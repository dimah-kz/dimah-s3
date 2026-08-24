import Link from "next/link";
import { Sparkles } from "lucide-react";
import { docsRoute, packageVersion } from "@/lib/shared";
import { cn } from "@/lib/utils";

export function HomeAnnouncement({ className }: { className?: string }) {
  return (
    <Link
      href={docsRoute}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-fd-border px-3 py-1 text-sm font-medium tracking-wide text-fd-muted-foreground transition-colors hover:border-fd-foreground/20 hover:text-fd-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <Sparkles className="size-3.5" aria-hidden />v{packageVersion} is out
    </Link>
  );
}
