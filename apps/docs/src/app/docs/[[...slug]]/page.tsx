import { getPageImage, getPageMarkdownUrl, source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  appName,
  docsArticleJsonLd,
  docsPageKeywords,
  gitConfig,
  serializeJsonLd,
} from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";
import {
  languageAlternates,
  languageAttributes,
  ogLocale,
  translationLinks,
} from "@/lib/page-language";
import { TranslationLink } from "@/components/translation-link";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const language = languageAttributes(page.data.lang);
  const jsonLd = docsArticleJsonLd({
    origin: getSiteUrl().origin,
    url: page.url,
    title: page.data.title,
    description: page.data.description ?? "",
    language: page.data.lang,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle {...language}>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0" {...language}>
          {page.data.description}
        </DocsDescription>
        <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${gitConfig.contentPath}/${page.path}`}
          />
          {translationLinks(page.data.translations).map((link) => (
            <TranslationLink key={link.lang} {...link} />
          ))}
        </div>
        <DocsBody {...language}>
          <MDX
            components={getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const markdownUrl = getPageMarkdownUrl(page).url;
  const image = getPageImage(page).url;

  return {
    title: page.data.title,
    description: page.data.description,
    keywords: docsPageKeywords(page.data.title),
    alternates: {
      canonical: page.url,
      languages: languageAlternates(
        page.url,
        page.data.lang,
        page.data.translations,
      ),
      types: {
        "text/markdown": markdownUrl,
      },
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      siteName: appName,
      images: image,
      locale: ogLocale(page.data.lang),
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      site: "@dimahkzx",
      creator: "@dimahkzx",
      title: page.data.title,
      description: page.data.description,
      images: image,
    },
  };
}
