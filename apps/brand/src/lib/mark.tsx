import { CloudUpload } from "lucide-react";
import { cn } from "cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white",
        className,
      )}
    >
      <CloudUpload className="size-[18px]" aria-hidden="true" />
    </span>
  );
}
