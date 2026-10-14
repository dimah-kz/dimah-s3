import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BlogBackLink,
  BlogCards,
  BlogDescription,
  BlogHeader,
  BlogTitle,
} from "@/components/blog";
import { getPosts, getTagPosts, getTags } from "@/lib/blog";
import { blogAuthors, blogSource } from "@/lib/source";
import { appName } from "@/lib/shared";

export default async function Page(props: PageProps<"/blog/tags/[tag]">) {
  const { tag } = await props.params;
  const result = getTagPosts(getPosts(blogSource.getPages(), blogAuthors), tag);
  if (!result) notFound();

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-12">
      <BlogHeader>
        <BlogBackLink href="/blog/tags">All Tags</BlogBackLink>
        <BlogTitle>{result.tag.name}</BlogTitle>
        <BlogDescription>{result.posts.length} matching posts.</BlogDescription>
      </BlogHeader>
      <BlogCards posts={result.posts} />
    </div>
  );
}

export async function generateMetadata(
  props: PageProps<"/blog/tags/[tag]">,
): Promise<Metadata> {
  const { tag } = await props.params;
  const result = getTagPosts(getPosts(blogSource.getPages()), tag);
  if (!result) notFound();

  const title = result.tag.name;
  const description = `Posts tagged ${result.tag.name}.`;

  return {
    alternates: {
      canonical: result.tag.url,
    },
    description,
    openGraph: {
      description,
      siteName: appName,
      title,
      url: result.tag.url,
    },
    title,
    twitter: {
      card: "summary",
      creator: "@dimahkzx",
      description,
      site: "@dimahkzx",
      title,
    },
  };
}

export function generateStaticParams(): { tag: string }[] {
  return getTags(getPosts(blogSource.getPages())).map((tag) => ({
    tag: tag.slug,
  }));
}
