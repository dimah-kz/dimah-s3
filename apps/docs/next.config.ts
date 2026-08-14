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
    ];
  },
};

export default withMDX(nextConfig);
