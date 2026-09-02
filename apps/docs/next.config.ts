import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
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

    return [
      { source: "/", headers: [describedBy] },
      { source: "/docs", headers: [describedBy] },
      { source: "/docs/:path*", headers: [describedBy] },
      { source: "/llms.txt", headers: [cors] },
      { source: "/llms-full.txt", headers: [cors] },
      { source: "/docs.md", headers: [cors, describedBy] },
      { source: "/docs/:path*.md", headers: [cors, describedBy] },
      { source: "/llms.mdx/:path*", headers: [cors, describedBy] },
    ];
  },
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/llms.mdx/docs" },
      { source: "/docs.mdx", destination: "/llms.mdx/docs" },
      { source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*" },
      { source: "/docs/:path*.mdx", destination: "/llms.mdx/docs/:path*" },
    ];
  },
  async redirects() {
    return [
      {
        source: "/docs/react/ui/setup",
        destination: "/docs/react/ui",
        permanent: true,
      },
      {
        source: "/docs/server/adapters",
        destination: "/docs/server/setup",
        permanent: true,
      },
      {
        source: "/docs/server/helpers",
        destination: "/docs/server/setup",
        permanent: true,
      },
      {
        source: "/docs/server/custom-plugins",
        destination: "/docs/server/plugins",
        permanent: true,
      },
      {
        source: "/docs/server/hooks/composition",
        destination: "/docs/server/plugins",
        permanent: true,
      },
      {
        source: "/docs/server/hooks/guard",
        destination: "/docs/server/hooks/global-guard",
        permanent: true,
      },
    ];
  },
};

export default withMDX(nextConfig);
