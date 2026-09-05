import { appName } from "./shared";

const introFaqs = [
  {
    question: "When should I choose dimah-s3?",
    answer:
      "Choose dimah-s3 when your application owns an S3-compatible bucket and needs more than an upload picker: server-owned keys, verified confirmation, private downloads, guarded deletion, multipart resume, or optional database tracking.",
  },
  {
    question: "Does dimah-s3 replace the AWS SDK?",
    answer:
      "No. dimah-s3 owns presign upload, download, and delete flows. Use the AWS SDK directly for application-specific operations such as list, copy, retention, or arbitrary object tagging.",
  },
  {
    question: "Can I use dimah-s3 with Cloudflare R2 or MinIO?",
    answer:
      'Yes. Configure an AWS SDK S3Client for the provider. Cloudflare R2 upload routes use method: "PUT"; MinIO commonly needs forcePathStyle: true.',
  },
  {
    question: "How does dimah-s3 keep S3 credentials secure?",
    answer:
      "Credentials never leave your server. The browser sends a route name, the server runs guards and chooses a key inside that route's namespace, and the browser receives only a short-lived signed request.",
  },
  {
    question: "Does dimah-s3 support resumable multipart uploads?",
    answer:
      "Yes. Multipart uploads support chunking, retries, cancellation, and part reconciliation. Add a persistent UploadStore to resume after a page reload.",
  },
] as const;

const faqHubFaqs = [
  {
    question: "What does dimah-s3 provide?",
    answer:
      "dimah-s3 provides a typed, presign-first lifecycle for S3-compatible storage: server routes and guards, React transfer state, optional shadcn UI, and optional database tracking.",
  },
  {
    question: "Do S3 credentials ever reach the browser?",
    answer:
      "No. The server owns the S3 client and returns only short-lived signed requests. Never put S3 access keys in client code or public environment variables.",
  },
  {
    question: "What does upload confirmation verify?",
    answer:
      "Confirmation reads HeadObject from storage and rechecks the stored size and Content-Type against route constraints. Content-Type is metadata, so inspect magic bytes separately when content authenticity matters.",
  },
  {
    question: "Which storage providers are supported?",
    answer:
      "Any provider with an S3-compatible API can work. The documentation includes configuration for Amazon S3, Cloudflare R2, and MinIO.",
  },
  {
    question: "Can a multipart upload resume after a page reload?",
    answer:
      "Yes, when multipart is enabled and useUpload receives a persistent UploadStore. The client restores the upload ID and reconciles completed parts before continuing.",
  },
  {
    question: "Do I have to use the provided UI components?",
    answer:
      "No. @dimah-s3/react is headless. Build a custom interface from its hooks or install the optional @dimah-s3/ui components.",
  },
  {
    question: "Is @dimah-s3/db required?",
    answer:
      "No. Add it only when you need object ownership, confirmed-only access, lifecycle rows, listings, usage totals, or quota guards.",
  },
  {
    question: "Is dimah-s3 free to operate?",
    answer:
      "There is no separate dimah-s3 SaaS fee, but you still pay for object storage, requests, transfer, compute, observability, and application operations.",
  },
] as const;

const faqsByUrl: Record<
  string,
  readonly { question: string; answer: string }[]
> = {
  "/docs": introFaqs,
  "/docs/faq": faqHubFaqs,
};

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

  const faqs = faqsByUrl[input.url];
  if (faqs) {
    graph.push({
      "@type": "FAQPage",
      url: pageUrl,
      mainEntity: faqs.map((faq) => ({
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
