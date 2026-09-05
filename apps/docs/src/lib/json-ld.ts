import { appName } from "./shared";

const introFaqs = [
  {
    question: "How does dimah-s3 differ from UploadThing and Better Upload?",
    answer:
      "dimah-s3 is a self-hosted, full-stack toolkit for S3-compatible storage you own (AWS S3, Cloudflare R2, MinIO). UploadThing is hosted SaaS — dimah-s3 has no SaaS fees and keeps all data in your bucket. Better Upload focuses on PUT uploads — dimah-s3 covers the full object lifecycle: presigned upload, HeadObject confirmation, presigned download, server-guarded deletion, multipart resume, optional shadcn UI, and database tracking.",
  },
  {
    question: "How does delete work compared to upload and download?",
    answer:
      "Upload and download are presigned — the client talks to S3 directly. Delete runs on your server — the client sends a request, the server runs delete.guard, issues DeleteObjectCommand, and triggers onDeleted cleanup.",
  },
  {
    question: "Can I use dimah-s3 with Cloudflare R2 or MinIO?",
    answer:
      'Yes. Any S3-compatible storage works out of the box. Cloudflare R2 — set upload: { method: "PUT" }. MinIO — pass forcePathStyle: true on the S3Client.',
  },
  {
    question: "How does dimah-s3 keep S3 credentials secure?",
    answer:
      "AWS credentials never leave your server. The client only sends a route name. The server validates guards, enforces quotas, and returns a short-lived presigned URL. Keys are server-owned and confined to the route prefix.",
  },
  {
    question: "Does dimah-s3 support resumable multipart uploads?",
    answer:
      "Yes. For large files, @dimah-s3/server and @dimah-s3/react provide built-in multipart chunking, parallel part uploads, and resume support for interrupted transfers.",
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
