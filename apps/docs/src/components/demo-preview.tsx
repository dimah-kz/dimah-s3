import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { ComponentPreview } from "@/components/component-preview";

const demosDir = join(process.cwd(), "src/components/demos");

type DemoPreviewProps = {
  name: string;
  children: ReactNode;
  lang?: string;
};

/** Server wrapper that injects live demo source into ComponentPreview. */
export function DemoPreview({ name, children, lang }: DemoPreviewProps) {
  const code = readFileSync(join(demosDir, name), "utf-8");

  return (
    <ComponentPreview code={code} lang={lang}>
      {children}
    </ComponentPreview>
  );
}
