import Link from "fumadocs-core/link";
import { TagsIcon } from "lucide-react";
import type { Metadata } from "next";
import {
  BlogCards,
  BlogDescription,
  BlogHeader,
  BlogTitle,
} from "@/components/blog";
import { getPosts } from "@/lib/blog";
import { blogDescription } from "@/lib/blog-content";
import { blogAuthors, blogSource } from "@/lib/source";
import { appName, blogRoute } from "@/lib/shared";

const blogTitle = "Blog";

export const metadata: Metadata = {
  alternates: {
    canonical: blogRoute,
    types: {
      "text/markdown": `${blogRoute}.md`,
    },
  },
  description: blogDescription,
  openGraph: {
    description: blogDescription,
    images: "/og/blog/image.png",
    siteName: appName,
    title: blogTitle,
    type: "website",
    url: blogRoute,
  },
  title: blogTitle,
  twitter: {
    card: "summary_large_image",
    creator: "@dimahkzx",
    description: blogDescription,
    images: "/og/blog/image.png",
    site: "@dimahkzx",
    title: blogTitle,
  },
};

export default function Page() {
  const posts = getPosts(blogSource.getPages(), blogAuthors);

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-12">
      <BlogHeader>
        <BlogTitle>{blogTitle}</BlogTitle>
        <BlogDescription>{blogDescription}</BlogDescription>
        <Link
          href="/blog/tags"
          className="inline-flex items-center gap-2 rounded-lg border bg-fd-secondary px-3 py-1.5 text-sm transition-colors hover:bg-fd-accent"
        >
          <TagsIcon className="size-4" />
          All Tags
        </Link>
      </BlogHeader>
      <BlogCards posts={posts} />
    </div>
  );
}
