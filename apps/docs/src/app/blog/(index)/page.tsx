import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import type { Metadata } from "next";
import { cn } from "cn";
import { BlogAuthor } from "@/components/blog-author";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { blogDescription, getBlogPosts } from "@/lib/blog";
import { appName, blogRoute, serializeJsonLd } from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";

const display = Instrument_Serif({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  weight: "400",
});

const blogTitle = "Blog";

export const metadata: Metadata = {
  alternates: {
    canonical: blogRoute,
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
  const posts = getBlogPosts();
  const origin = getSiteUrl().origin;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      author: {
        "@type": "Person",
        name: post.data.author.name,
        ...(post.data.author.url ? { url: post.data.author.url } : {}),
      },
      datePublished: post.data.date,
      headline: post.data.title,
      url: `${origin}${post.url}`,
    })),
    description: blogDescription,
    name: `${appName} Blog`,
    url: `${origin}${blogRoute}`,
  };

  return (
    <div className="mx-auto flex w-full max-w-284 flex-1 flex-col px-6 py-14 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <header className="max-w-xl">
        <h1
          className={cn(
            display.className,
            "text-5xl leading-none font-normal tracking-[-0.02em] text-fd-foreground sm:text-6xl",
          )}
        >
          Blog
        </h1>
        <p className="mt-4 text-base leading-7 text-pretty text-fd-muted-foreground">
          {blogDescription}
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-14 text-sm text-fd-muted-foreground">No posts yet.</p>
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <li key={post.url} className="min-w-0">
              <Card className="relative h-full">
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={post.url}
                      className="underline-offset-4 group-hover/card:underline after:absolute after:inset-0"
                    >
                      {post.data.title}
                    </Link>
                  </CardTitle>
                  {post.data.description ? (
                    <CardDescription className="text-pretty">
                      {post.data.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardFooter className="mt-auto">
                  <BlogAuthor author={post.data.author} date={post.data.date} />
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
