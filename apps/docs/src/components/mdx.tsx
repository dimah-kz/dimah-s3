import { cn } from "cn";
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

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ComponentPreview,
    DemoPreview,
    Flow,
    ...AccordionComponents,
    Accordions: ({
      className,
      ...props
    }: React.ComponentProps<typeof AccordionComponents.Accordions>) => (
      <AccordionComponents.Accordions
        className={cn("my-6", className)}
        {...props}
      />
    ),
    ...TabsComponents,
    ...FilesComponents,
    ...CardComponents,
    Cards: ({
      className,
      ...props
    }: React.ComponentProps<typeof CardComponents.Cards>) => (
      <CardComponents.Cards className={cn("my-6", className)} {...props} />
    ),
    ...StepsComponents,
    TypeTable,
    AutoTypeTable: (props: Partial<AutoTypeTableProps>) => (
      <AutoTypeTable
        {...props}
        generator={typeTableGeneratorFor(props.path)}
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
