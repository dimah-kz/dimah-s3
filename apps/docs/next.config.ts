import { createMDX } from "fumadocs-mdx/next";
import { nextBuildCpus } from "../../scripts/next-build-cpus.mjs";

const withMDX = createMDX();
const cpus = nextBuildCpus();

/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    useTypeScriptCli: true,
    ...(cpus ? { cpus } : {}),
  },
  reactStrictMode: true,
};

export default withMDX(config);
