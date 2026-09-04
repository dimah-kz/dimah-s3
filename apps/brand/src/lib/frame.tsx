import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import type { BrandSize } from "@/catalog";

/** Light shadcn tokens on the frame so stills and videos do not pick up page chrome. */
export const BRAND_FRAME_STYLE: CSSProperties = {
  colorScheme: "light",
  backgroundColor: "#f4f4f5",
  color: "#09090b",
  ["--background" as string]: "oklch(1 0 0)",
  ["--foreground" as string]: "oklch(0.145 0 0)",
  ["--card" as string]: "oklch(1 0 0)",
  ["--card-foreground" as string]: "oklch(0.145 0 0)",
  ["--muted" as string]: "oklch(0.97 0 0)",
  ["--muted-foreground" as string]: "oklch(0.556 0 0)",
  ["--border" as string]: "oklch(0.922 0 0)",
  ["--primary" as string]: "oklch(0.205 0 0)",
  ["--primary-foreground" as string]: "oklch(0.985 0 0)",
  ["--secondary" as string]: "oklch(0.97 0 0)",
  ["--secondary-foreground" as string]: "oklch(0.205 0 0)",
  ["--accent" as string]: "oklch(0.97 0 0)",
  ["--accent-foreground" as string]: "oklch(0.205 0 0)",
  ["--destructive" as string]: "oklch(0.577 0.245 27.325)",
  ["--input" as string]: "oklch(0.922 0 0)",
  ["--ring" as string]: "oklch(0.708 0 0)",
};

export function BrandFrame({
  size,
  children,
  className,
}: {
  size: BrandSize;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-brand-frame
      className={cn(
        "flex flex-col items-center justify-center overflow-hidden",
        className,
      )}
      style={{ width: size.width, height: size.height, ...BRAND_FRAME_STYLE }}
    >
      {children}
    </div>
  );
}

/** Product window chrome. Visible from frame 0 so tweet thumbnails are not empty. */
export function BrandWindow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-zinc-200 bg-white",
        "shadow-[0_1px_1px_rgba(24,24,27,0.04),0_12px_32px_rgba(24,24,27,0.08),0_32px_64px_-16px_rgba(24,24,27,0.22)]",
        className,
      )}
    >
      <div className="relative flex h-10 items-center border-b border-zinc-100 px-3.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-medium text-zinc-400">
          Attachment
        </span>
      </div>
      <div className="px-8 py-8">{children}</div>
    </div>
  );
}
