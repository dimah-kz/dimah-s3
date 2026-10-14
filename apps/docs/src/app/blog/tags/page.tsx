import type { Metadata } from "next";
import {
  BlogBackLink,
  BlogDescription,
  BlogHeader,
  BlogTagCards,
  BlogTitle,
} from "@/components/blog";
import { getPosts, getTags } from "@/lib/blog";
import { blogSource } from "@/lib/source";
import { appName } from "@/lib/shared";

const title = "Blog Tags";
const description = "All tags.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/blog/tags",
  },
  description,
  openGraph: {
    description,
    siteName: appName,
    title,
    url: "/blog/tags",
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
