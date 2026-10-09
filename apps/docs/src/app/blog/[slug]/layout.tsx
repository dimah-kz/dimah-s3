import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { blog } from "@/lib/blog";
import { baseOptions } from "@/lib/layout.shared";

/**
 * Article column beside the default TOC. No site header and no sidebar.
 * The TOC column stays 0 until the docs TOC sets `--fd-toc-width`.
 */
const articleGridTemplate = `"toc-popover toc-popover toc-popover toc-popover" auto
". main toc ." 1fr
/ minmax(0, 1fr) minmax(0, min(900px, 100% - var(--fd-toc-width))) var(--fd-toc-width) minmax(0, 1fr)`;

export default function Layout({ children }: LayoutProps<"/blog/[slug]">) {
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      containerProps={{
        style: {
          gridTemplate: articleGridTemplate,
        },
      }}
      nav={{
        ...base.nav,
        enabled: false,
      }}
      sidebar={{
        enabled: false,
      }}
      tree={blog.getPageTree()}
    >
      {children}
    </DocsLayout>
  );
}
