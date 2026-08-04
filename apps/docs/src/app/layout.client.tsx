"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getSection } from "@/lib/source/navigation";

export function Body({ children }: { children: ReactNode }) {
  const mode = useMode();

  return (
    <body className={cn(mode, "relative flex min-h-screen flex-col")}>
      {children}
    </body>
  );
}

function useMode(): string | undefined {
  const params = useParams();
  const slug = params.slug;
  if (Array.isArray(slug)) return getSection(slug.join("/"));
  return "framework";
}
