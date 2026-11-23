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
import { getBlogTagImage, tagDescription } from "@/lib/blog-content";
import { blogAuthors, blogSource } from "@/lib/source";
import { appName, shareImage } from "@/lib/shared";

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
  const description = tagDescription(result.tag.name, result.posts.length);
  const image = shareImage(getBlogTagImage(result.tag.slug).url, title);

  return {
    alternates: {
      canonical: result.tag.url,
    },
    description,
    openGraph: {
      description,
      images: image,
      siteName: appName,
      title,
      url: result.tag.url,
    },
    title,
    twitter: {
      card: "summary_large_image",
      creator: "@dimahkzx",
      description,
      images: image,
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
