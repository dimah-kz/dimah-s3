import type { NextConfig } from "next";
import { nextBuildCpus } from "../../scripts/next-build-cpus.mjs";

const cpus = nextBuildCpus();

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
    ...(cpus ? { cpus } : {}),
  },
  /* config options here */
  reactCompiler: true,
};

export default nextConfig;
