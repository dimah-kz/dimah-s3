import { appName } from "./shared";

const introFaqs = [
  {
    question: "How does delete work compared to upload and download?",
    answer:
      "Upload and download are presigned (the client communicates directly with S3). Deletion is executed server-side: the client sends a delete request to your API, the server runs your delete.guard, issues DeleteObjectCommand via the AWS SDK, and triggers onDeleted cleanup.",
  },
  {
    question: "Can I use dimah-s3 with Cloudflare R2 or MinIO?",
    answer:
      'Yes. Any S3-compatible storage works out of the box. For Cloudflare R2, configure upload: { method: "PUT" }. For MinIO, pass forcePathStyle: true in your S3Client.',
  },
] as const;

export function docsArticleJsonLd(input: {
  origin: string;
  url: string;
  title: string;
  description: string;
}) {
  const pageUrl = `${input.origin}${input.url}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "TechArticle",
      headline: input.title,
      description: input.description,
      url: pageUrl,
      inLanguage: "en",
      isPartOf: {
        "@type": "WebSite",
        name: appName,
        url: input.origin,
      },
      author: {
        "@type": "Organization",
        name: appName,
        url: input.origin,
      },
    },
  ];

  if (input.url === "/docs") {
    graph.push({
      "@type": "FAQPage",
      url: pageUrl,
      mainEntity: introFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
