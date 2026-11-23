import defaultMdxComponents from "fumadocs-ui/mdx";
import * as AccordionComponents from "fumadocs-ui/components/accordion";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import * as FilesComponents from "fumadocs-ui/components/files";
import * as CardComponents from "fumadocs-ui/components/card";

import { ComponentPreview } from "@/components/component-preview";
import { DemoPreview } from "@/components/demo-preview";
import { ErrorCodeTable } from "@/components/error-code-table";
import { Flow } from "@/components/flow";
import * as StepsComponents from "fumadocs-ui/components/steps";
import type { MDXComponents } from "mdx/types";

/**
 * Components available in every docs page. API references are hand-written
 * Markdown tables, so the `.md` twin of a page carries them too (see
 * docs/agents/docs.md).
 */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ComponentPreview,
    DemoPreview,
    ErrorCodeTable,
    Flow,
    ...AccordionComponents,
    ...TabsComponents,
    ...FilesComponents,
    ...CardComponents,
    ...StepsComponents,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
