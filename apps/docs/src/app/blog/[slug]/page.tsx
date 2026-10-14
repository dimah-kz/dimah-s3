import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BlogAuthors,
  BlogBackLink,
  BlogBody,
  BlogDate,
  BlogDescription,
  BlogHeader,
  BlogPage,
  BlogPostNav,
  BlogTags,
  BlogTitle,
} from "@/components/blog";
import { getMDXComponents } from "@/components/mdx";
import { findPost, getPosts } from "@/lib/blog";
import { getBlogPageImage } from "@/lib/blog-content";
import { blogAuthors, blogSource } from "@/lib/source";
import { appName, docsPageKeywords } from "@/lib/shared";

export default async function Page(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  const found =
    page && findPost(getPosts(blogSource.getPages(), blogAuthors), page.url);
  if (!page || !found) notFound();

  const { post, newer, older } = found;
  const MDX = page.data.body;

  return (
    <BlogPage toc={page.data.toc}>
      <BlogHeader>
        <BlogBackLink href="/blog" />
        <BlogTitle>{post.title}</BlogTitle>
        <BlogDescription>{post.description}</BlogDescription>
        <BlogAuthors authors={post.authors} />
        <div className="flex w-full flex-row flex-wrap items-center gap-2">
          <BlogTags tags={post.tags} />
          {post.date ? (
            <BlogDate
              date={post.date}
              className="ms-auto text-sm text-fd-muted-foreground"
            />
          ) : null}
        </div>
      </BlogHeader>
      <BlogBody>
        <MDX components={getMDXComponents()} />
      </BlogBody>
      <BlogPostNav newer={newer} older={older} />
    </BlogPage>
  );
}

export function generateStaticParams(): { slug: string }[] {
  return blogSource.getPages().flatMap((page) => {
    const slug = page.slugs[0];
    return slug ? [{ slug }] : [];
  });
}

export async function generateMetadata(
  props: PageProps<"/blog/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) notFound();

  const image = getBlogPageImage(page).url;
  const authors = page.data.authors ?? [];

  return {
    alternates: {
      canonical: page.url,
      types: {
        "text/markdown": `${page.url}.md`,
      },
    },
    description: page.data.description,
    keywords: ["blog", ...docsPageKeywords(page.data.title)],
    openGraph: {
      authors,
      description: page.data.description,
      images: image,
      publishedTime:
        page.data.date instanceof Date
          ? page.data.date.toISOString()
          : page.data.date,
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
