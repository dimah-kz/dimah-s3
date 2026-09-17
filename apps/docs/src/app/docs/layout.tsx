import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { getSection } from "@/lib/source/navigation";

export default function Layout({ children }: LayoutProps<"/docs">) {
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      tree={source.getPageTree()}
      tabs={{
        transform(option, node) {
          const meta = source.getNodeMeta(node);
          if (!meta || !node.icon) return option;
          const color = `var(--${getSection(meta.path)}-color, var(--color-fd-foreground))`;

          return {
            ...option,
            icon: (
              <div
                className="size-full rounded-lg text-(--tab-color) max-md:border max-md:bg-(--tab-color)/10 max-md:p-1.5 [&_svg]:size-full"
                style={
                  {
                    "--tab-color": color,
                  } as object
                }
              >
                {node.icon}
              </div>
            ),
          };
        },
      }}
    >
      {children}
    </DocsLayout>
  );
}
