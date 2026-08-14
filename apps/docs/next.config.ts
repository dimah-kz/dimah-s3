import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Native Rust React Compiler inside Turbopack (default bundler in Next 16).
    turbopackRustReactCompiler: true,
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
