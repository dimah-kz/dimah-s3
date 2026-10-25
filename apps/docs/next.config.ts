import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { PRODUCTION_SITE_ORIGIN } from "./src/lib/site-url";

const withMDX = createMDX();

/** Old hosts that were indexed. One 308 onto https://s3.dimah.dev. */
const alternateHosts = ["dimah-s3.vercel.app", "www.s3.dimah.dev"] as const;

type PermanentRedirect = {
  source: string;
  destination: string;
  permanent: true;
  has: [{ type: "host"; value: string }];
};

function hostRedirect(
  host: string,
  source: string,
  destination: string,
): PermanentRedirect {
  return {
    source,
    destination,
    permanent: true,
    has: [{ type: "host", value: host }],
  };
}

const nextConfig: NextConfig = {
  // Indexable URLs have no trailing slash (`/docs`, not `/docs/`).
  trailingSlash: false,
  // Every docs URL is prerendered (`generateStaticParams` + `ensureStatic =
  // "navigation"`). Partial prefetching only ships the shared shell and streams
  // each article on click, so keep the full static prefetch.
  cacheComponents: true,
  partialPrefetching: false,
  reactCompiler: true,
  experimental: {
    // Native Rust React Compiler inside Turbopack (default bundler in Next 16).
    turbopackRustReactCompiler: true,
  },
  async headers() {
    const cors = { key: "Access-Control-Allow-Origin", value: "*" };
    const describedBy = {
      key: "Link",
      value: '</llms.txt>; rel="describedby"',
    };
    const previewRobots =
      process.env.VERCEL_ENV === "preview"
        ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
        : [];
    const corpusRobots = { key: "X-Robots-Tag", value: "noindex" };

    return [
      { source: "/", headers: [describedBy, ...previewRobots] },
      { source: "/docs", headers: [describedBy, ...previewRobots] },
      { source: "/docs/:path*", headers: [describedBy, ...previewRobots] },
      { source: "/blog", headers: [describedBy, ...previewRobots] },
      { source: "/blog/:path*", headers: [describedBy, ...previewRobots] },
      { source: "/llms.txt", headers: [cors, corpusRobots] },
      { source: "/llms-full.txt", headers: [cors, corpusRobots] },
      { source: "/docs.md", headers: [cors] },
      { source: "/docs/:path*.md", headers: [cors] },
      { source: "/blog.md", headers: [cors, describedBy] },
      { source: "/blog/:path*.md", headers: [cors, describedBy] },
      { source: "/llms.mdx/docs", headers: [cors] },
      { source: "/llms.mdx/docs/:path*", headers: [cors] },
      { source: "/llms.mdx/blog", headers: [cors, describedBy] },
      { source: "/llms.mdx/blog/:path*", headers: [cors, describedBy] },
    ];
  },
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/llms.mdx/docs" },
      { source: "/docs.mdx", destination: "/llms.mdx/docs" },
      { source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*" },
      { source: "/docs/:path*.mdx", destination: "/llms.mdx/docs/:path*" },
      { source: "/blog.md", destination: "/llms.mdx/blog" },
      { source: "/blog.mdx", destination: "/llms.mdx/blog" },
      { source: "/blog/:path*.md", destination: "/llms.mdx/blog/:path*" },
      { source: "/blog/:path*.mdx", destination: "/llms.mdx/blog/:path*" },
    ];
  },
  async redirects() {
    return alternateHosts.flatMap((host) => [
      hostRedirect(host, "/:path+/", `${PRODUCTION_SITE_ORIGIN}/:path+`),
      hostRedirect(host, "/", PRODUCTION_SITE_ORIGIN),
      hostRedirect(host, "/:path+", `${PRODUCTION_SITE_ORIGIN}/:path+`),
    ]);
  },
};

export default withMDX(nextConfig);
