import type { CSSProperties, ReactNode } from "react";
import type { BrandSize } from "@/catalog";
import { cn } from "@/lib/utils";

/** Light shadcn tokens on the frame so the still does not pick up page chrome. */
const LIGHT: CSSProperties = {
  colorScheme: "light",
  backgroundColor: "#fafafa",
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
      style={{ width: size.width, height: size.height, ...LIGHT }}
    >
      {children}
    </div>
  );
}
