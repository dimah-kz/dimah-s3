import { cacheLife } from "next/cache";
import defaultMdxComponents from "fumadocs-ui/mdx";
import * as AccordionComponents from "fumadocs-ui/components/accordion";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import * as FilesComponents from "fumadocs-ui/components/files";
import * as CardComponents from "fumadocs-ui/components/card";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { AutoTypeTable, type AutoTypeTableProps } from "fumadocs-typescript/ui";
import {
  typeTableBasePath,
  typeTableGeneratorFor,
} from "@/lib/type-table-generator";

import { ComponentPreview } from "@/components/component-preview";
import { DemoPreview } from "@/components/demo-preview";
import { Flow } from "@/components/flow";
import * as StepsComponents from "fumadocs-ui/components/steps";
import type { MDXComponents } from "mdx/types";

type CachedAutoTypeTableProps = Pick<
  AutoTypeTableProps,
  "name" | "path" | "type"
>;

/** Type extraction reads the filesystem. Cache it so docs pages stay fully static. */
async function CachedAutoTypeTable(props: CachedAutoTypeTableProps) {
  "use cache";
  cacheLife("max");

  return (
    <AutoTypeTable
      {...props}
      generator={typeTableGeneratorFor(props.path)}
      options={{ basePath: typeTableBasePath }}
    />
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ComponentPreview,
    DemoPreview,
    Flow,
    ...AccordionComponents,
    ...TabsComponents,
    ...FilesComponents,
    ...CardComponents,
    ...StepsComponents,
    TypeTable,
    AutoTypeTable: CachedAutoTypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
