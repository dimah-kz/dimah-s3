import defaultMdxComponents from "fumadocs-ui/mdx";
import * as AccordionComponents from "fumadocs-ui/components/accordion";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import * as FilesComponents from "fumadocs-ui/components/files";
import * as CardComponents from "fumadocs-ui/components/card";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { AutoTypeTable, type AutoTypeTableProps } from "fumadocs-typescript/ui";
import {
  typeTableBasePath,
  typeTableGenerator,
} from "@/lib/type-table-generator";

import { ComponentPreview } from "@/components/component-preview";
import { DemoPreview } from "@/components/demo-preview";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ComponentPreview,
    DemoPreview,
    ...AccordionComponents,
    ...TabsComponents,
    ...FilesComponents,
    ...CardComponents,
    TypeTable,
    AutoTypeTable: (props: Partial<AutoTypeTableProps>) => (
      <AutoTypeTable
        {...props}
        generator={typeTableGenerator}
        options={{ basePath: typeTableBasePath, ...props.options }}
      />
    ),
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
