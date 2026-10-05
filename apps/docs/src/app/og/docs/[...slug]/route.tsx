import { DocsCard } from "@/components/og/docs-card";
import { ogFonts } from "@/lib/og-fonts";
import { appName, siteTagline } from "@/lib/shared";
import { getPageImage, source } from "@/lib/source";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const card = ogCard(page.slugs, page.data.title, page.data.description);

  return new ImageResponse(
    <DocsCard
      brand={appName}
      description={card.description}
      label={card.label}
      layout={card.layout}
      title={card.title}
    />,
    {
      fonts: await ogFonts(),
      height: 630,
      width: 1200,
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageImage(page).segments,
  }));
}

function ogCard(slugs: string[], title: string, description?: string) {
  const text = (description ?? "").replaceAll("`", "").trim();

  if (slugs.length === 0) {
    return {
      layout: "cover" as const,
      label: "Documentation",
      title: siteTagline,
      description: capitalize(text.split(" — ")[1]?.trim() || text),
    };
  }

  return {
    layout: "page" as const,
    label: sectionLabel(slugs),
    title,
    description: text || undefined,
  };
}

function capitalize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function sectionLabel(slugs: string[]) {
  const [first, second] = slugs;
  if (first === "react" && second === "ui") return "React UI";
  if (first === "react") return "React";
  if (first === "server") return "Server";
  if (first === "core") return "Core";
  if (first === "db") return "Database";
  if (first === "providers") return "Providers";
  return "Docs";
}
