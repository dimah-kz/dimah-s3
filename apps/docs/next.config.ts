import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { PRODUCTION_SITE_ORIGIN } from "./src/lib/site-url";

const withMDX = createMDX();

/** Hosts that must not be indexed. One 308 to the canonical origin. */
const alternateHosts = ["dimah-s3.vercel.app", "www.s3.dimah.dev"] as const;

/**
 * Old docs paths. Each variant (slash and `.md`) goes straight to the final
 * URL so Google does not have to follow a redirect chain.
 */
const movedDocs = [
  ["/docs/react/ui/setup", "/docs/react/ui"],
  ["/docs/db/hooks", "/docs/db/lifecycle-hooks"],
  ["/docs/server/adapters", "/docs/server/setup"],
  ["/docs/server/helpers", "/docs/server/setup"],
  ["/docs/server/custom-plugins", "/docs/server/plugins"],
  ["/docs/server/hooks/composition", "/docs/server/plugins"],
  ["/docs/server/hooks/guard", "/docs/server/hooks/global-guard"],
] as const;

type PermanentRedirect = {
  source: string;
  destination: string;
  permanent: true;
  has?: [{ type: "host"; value: string }];
};

function permanent(
  source: string,
  destination: string,
  host?: string,
): PermanentRedirect {
  return {
    source,
    destination,
    permanent: true,
    ...(host ? { has: [{ type: "host", value: host }] } : {}),
  };
}

function movedRedirects(from: string, to: string, host?: string) {
  const html = host ? `${PRODUCTION_SITE_ORIGIN}${to}` : to;
  const markdown = host ? `${PRODUCTION_SITE_ORIGIN}${to}.md` : `${to}.md`;

  return [
    permanent(from, html, host),
    permanent(`${from}/`, html, host),
    permanent(`${from}.md`, markdown, host),
    permanent(`${from}.md/`, markdown, host),
  ];
}

function alternateHostRedirects(host: string): PermanentRedirect[] {
  return [
    ...movedDocs.flatMap(([from, to]) => movedRedirects(from, to, host)),
    permanent("/:path+/", `${PRODUCTION_SITE_ORIGIN}/:path+`, host),
    permanent("/", PRODUCTION_SITE_ORIGIN, host),
    permanent("/:path+", `${PRODUCTION_SITE_ORIGIN}/:path+`, host),
  ];
}

const nextConfig: NextConfig = {
  // Indexable URLs have no trailing slash (`/docs`, not `/docs/`).
  trailingSlash: false,
  // The built-in slash redirect runs before these rules and would turn
  // `/old/` into `/old` and then into the new page (two hops). Own the
  // slash redirect so a moved URL resolves in one 308.
  skipTrailingSlashRedirect: true,
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
    return [
      ...alternateHosts.flatMap(alternateHostRedirects),
      ...movedDocs.flatMap(([from, to]) => movedRedirects(from, to)),
      permanent("/:path+/", "/:path+"),
    ];
  },
};

export default withMDX(nextConfig);
