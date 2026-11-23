import type { Metadata } from "next";
import {
  BlogBackLink,
  BlogDescription,
  BlogHeader,
  BlogTagCards,
  BlogTitle,
} from "@/components/blog";
import { getPosts, getTags } from "@/lib/blog";
import { blogTagsDescription, getBlogTagImage } from "@/lib/blog-content";
import { blogSource } from "@/lib/source";
import { appName, shareImage } from "@/lib/shared";

const title = "Blog Tags";
const description = blogTagsDescription;
const image = shareImage(getBlogTagImage().url, title);

export const metadata: Metadata = {
  alternates: {
    canonical: "/blog/tags",
  },
  description,
  openGraph: {
    description,
    images: image,
    siteName: appName,
    title,
    url: "/blog/tags",
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

export default function Page() {
  const tags = getTags(getPosts(blogSource.getPages()));

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-12">
      <BlogHeader>
        <BlogBackLink href="/blog" />
        <BlogTitle>All Tags</BlogTitle>
        <BlogDescription>{tags.length} tags in total.</BlogDescription>
      </BlogHeader>
      <BlogTagCards tags={tags} />
    </div>
  );
}
