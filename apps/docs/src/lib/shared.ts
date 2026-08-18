import corePackage from "../../../../packages/core/package.json";

export const appName = "dimah-s3";
export const packageVersion = corePackage.version;
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

export const siteTitle = `${appName} — Presign-first S3 for React and Next.js`;
export const siteDescription =
  "Upload, download, and delete in your own Amazon S3, Cloudflare R2, or MinIO bucket. Server, React hooks, optional UI and database — you pass an AWS SDK client.";

export const gitConfig = {
  user: "dimah-kz",
  repo: "dimah-s3",
  branch: "main",
  contentPath: "apps/docs/content/docs",
};

export const xProfileUrl = "https://x.com/dimahkzx";

export function githubRepoUrl() {
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
}

export function siteJsonLd(origin: string) {
  const repo = githubRepoUrl();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: appName,
        url: origin,
        description: siteDescription,
      },
      {
        "@type": "SoftwareSourceCode",
        name: appName,
        description: siteDescription,
        url: origin,
        codeRepository: repo,
        programmingLanguage: "TypeScript",
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        sameAs: [
          repo,
          xProfileUrl,
          "https://www.npmjs.com/package/@dimah-s3/server",
        ],
      },
    ],
  };
}
