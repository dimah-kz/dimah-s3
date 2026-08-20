import corePackage from "../../../../packages/core/package.json";

export const appName = "dimah-s3";
export const packageVersion = corePackage.version;
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

export const siteTitle = `${appName} — Presign-first S3 for React and Next.js`;
export const siteDescription =
  "Upload, download, and delete in your own S3-compatible bucket. Server, React hooks, optional UI and database — you pass an AWS SDK client.";

/** Short, accurate terms for crawlers that still read `keywords`. Not stuffed. */
export const siteKeywords = [
  "s3",
  "s3-compatible",
  "object storage",
  "presigned url",
  "file upload",
  "react",
  "next.js",
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
        name: appName,
        url: origin,
        description: siteDescription,
        inLanguage: "en",
        publisher: { "@id": orgId },
      },
      {
        "@type": "SoftwareApplication",
        name: appName,
        description: siteDescription,
        url: origin,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        softwareVersion: packageVersion,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        downloadUrl: npmPackageUrls[0],
        publisher: { "@id": orgId },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Presigned S3-compatible uploads",
          "Presigned downloads",
          "Server-side delete with the same guards",
          "Multipart upload and resume",
          "Headless React hooks",
          "Optional shadcn UI",
          "Next.js, Hono, Express, Fastify, Elysia, and SvelteKit adapters",
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
