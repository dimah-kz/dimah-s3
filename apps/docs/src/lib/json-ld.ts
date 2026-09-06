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
      "Yes. Multipart uploads support chunking, retries, cancellation, and part reconciliation. With a persistent UploadStore, the user can reselect the same local file after a reload and resume its stored upload.",
  },
] as const;

const faqsByUrl: Record<
  string,
  readonly { question: string; answer: string }[]
> = {
  "/docs": introFaqs,
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
