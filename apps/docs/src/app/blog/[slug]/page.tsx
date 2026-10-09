import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogAuthor } from "@/components/blog-author";
import { getMDXComponents } from "@/components/mdx";
import { Separator } from "@/components/ui/separator";
import {
  blog,
  blogPostingJsonLd,
  getBlogNeighbors,
  getBlogPageImage,
  type BlogPage,
} from "@/lib/blog";
import {
  appName,
  blogRoute,
  docsPageKeywords,
  serializeJsonLd,
} from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";

export default async function Page(props: PageProps<"/blog/[slug]">) {
  const params = await props.params;
  const page = blog.getPage([params.slug]);
  if (!page) notFound();

  const MDX = page.data.body;
  const image = getBlogPageImage(page).url;
  const neighbors = getBlogNeighbors(page.url);
  const jsonLd = blogPostingJsonLd({
    author: page.data.author,
    date: page.data.date,
    description: page.data.description ?? "",
    image,
    origin: getSiteUrl().origin,
    title: page.data.title,
    url: page.url,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <DocsPage
        breadcrumb={{
          enabled: false,
        }}
        footer={{
          items: {
            next: footerItem(neighbors.newer, "Newer"),
            previous: footerItem(neighbors.older, "Older"),
          },
        }}
        toc={page.data.toc}
      >
        <Link
          href={blogRoute}
          className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
        >
          Blog
        </Link>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0">
          {page.data.description}
        </DocsDescription>
        <BlogAuthor author={page.data.author} date={page.data.date} />
        <Separator />
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(blog, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    </>
  );
}

function footerItem(post: BlogPage | undefined, label: string) {
  if (!post) return undefined;

  return {
    description: label,
    name: post.data.title,
    url: post.url,
  };
}

export function generateStaticParams() {
  return blog.getPages().flatMap((page) => {
    const slug = page.slugs[0];
    return slug ? [{ slug }] : [];
  });
}

export async function generateMetadata(
  props: PageProps<"/blog/[slug]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = blog.getPage([params.slug]);
  if (!page) notFound();

  const image = getBlogPageImage(page).url;

  return {
    alternates: {
      canonical: page.url,
    },
    description: page.data.description,
    keywords: ["blog", ...docsPageKeywords(page.data.title)],
    openGraph: {
      authors: [page.data.author.name],
      description: page.data.description,
      images: image,
      publishedTime: page.data.date,
      siteName: appName,
      title: page.data.title,
      type: "article",
      url: page.url,
    },
    title: page.data.title,
    twitter: {
      card: "summary_large_image",
      creator: "@dimahkzx",
      description: page.data.description,
      images: image,
      site: "@dimahkzx",
      title: page.data.title,
    },
  };
}
