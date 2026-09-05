import corePackage from "../../../../packages/core/package.json";

export const appName = "dimah-s3";
export const packageVersion = corePackage.version;
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

/** Landing H1, browser tab, and Open Graph title — keep these in sync. */
export const siteTagline = "Full-stack S3 toolkit for the React ecosystem";
export const siteTitle = `${appName} — ${siteTagline}`;
export const siteDescription =
  "Upload, download, and delete in your own S3-compatible bucket. Server, React hooks, optional shadcn UI and database — you pass an AWS SDK client.";

/** Short, accurate terms for crawlers and AI search engines that read keywords and meta tags. */
export const siteKeywords = [
  "s3",
  "s3-compatible",
  "aws s3",
  "aws sdk v3",
  "cloudflare r2",
  "minio",
  "dimah s3",
  "object storage",
  "presigned url",
  "presigned post",
  "file upload",
  "file uploader",
  "multipart upload",
  "resumable upload",
  "direct upload to s3",
  "react",
  "react hooks",
  "next.js",
  "next.js app router",
  "shadcn",
  "shadcn ui",
  "shadcn dropzone",
  "shadcn file upload",
  "hono",
  "express",
  "fastify",
  "elysia",
  "sveltekit",
  "drizzle orm",
  "uploadthing alternative",
  "better upload alternative",
  "self-hosted uploadthing",
  "dimah s3",
  "dimah-s3",
  "typescript",
];

export const gitConfig = {
  user: "dimah-kz",
  repo: "dimah-s3",
  branch: "main",
  contentPath: "apps/docs/content/docs",
};

export const xProfileUrl = "https://x.com/dimahkzx";

export const npmPackageUrls = [
  "https://www.npmjs.com/package/@dimah-s3/server",
  "https://www.npmjs.com/package/@dimah-s3/react",
  "https://www.npmjs.com/package/@dimah-s3/ui",
  "https://www.npmjs.com/package/@dimah-s3/core",
  "https://www.npmjs.com/package/@dimah-s3/db",
  "https://www.npmjs.com/package/@dimah-s3/cli",
] as const;

export function githubRepoUrl() {
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
}

export function siteJsonLd(origin: string) {
  const repo = githubRepoUrl();
  const orgId = `${origin}/#organization`;
  const sameAs = [repo, xProfileUrl, ...npmPackageUrls];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: appName,
        url: origin,
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: appName,
        url: origin,
        description: siteDescription,
        inLanguage: "en",
        keywords: siteKeywords.join(", "),
        publisher: { "@id": orgId },
      },
      {
        "@type": "SoftwareApplication",
        name: appName,
        description: siteDescription,
        url: origin,
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "Cloud Storage / Developer Tools",
        operatingSystem: "Web",
        softwareVersion: packageVersion,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        downloadUrl: npmPackageUrls[0],
        keywords: siteKeywords.join(", "),
        publisher: { "@id": orgId },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Presigned S3-compatible direct uploads",
          "Amazon S3, Cloudflare R2, MinIO, and Wasabi support",
          "Presigned downloads & proxy preview",
          "Server-side deletion with lifecycle guards",
          "Resumable multipart uploads for large files",
          "Headless React hooks with progress & state tracking",
          "Pre-built optional shadcn UI components and dropzone",
          "Next.js App Router, Hono, Express, Fastify, Elysia, and SvelteKit adapters",
          "Optional database plugin for object tracking (Drizzle ORM)",
        ],
      },
      {
        "@type": "SoftwareSourceCode",
        name: appName,
        description: siteDescription,
        url: origin,
        codeRepository: repo,
        programmingLanguage: "TypeScript",
        runtimePlatform: "Node.js",
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        publisher: { "@id": orgId },
        sameAs,
      },
    ],
  };
}
