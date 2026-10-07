import { cacheLife } from "next/cache";
import { DocsCard } from "@/components/og/docs-card";
import { ogFonts } from "@/lib/og-fonts";
import { appName, siteTagline } from "@/lib/shared";
import { getPageImage, source } from "@/lib/source";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const payload = await ogPayload(slug);
  if (!payload) notFound();

  return new ImageResponse(
    <DocsCard
      brand={payload.brand}
      description={payload.description}
      label={payload.label}
      layout={payload.layout}
      title={payload.title}
    />,
    {
      fonts: payload.fonts.map((font) => ({
        ...font,
        data: Buffer.from(font.data, "base64"),
      })),
      height: 630,
      width: 1200,
    },
  );
}

async function ogPayload(slug: string[]) {
  "use cache";
  cacheLife("max");

  const page = source.getPage(slug.slice(0, -1));
  if (!page) return null;

  const card = ogCard(page.slugs, page.data.title, page.data.description);
  const fonts = await ogFonts();

  // `use cache` only keeps plain data. ImageResponse is built by the handler.
  return {
    brand: appName,
    description: card.description,
    label: card.label,
    layout: card.layout,
    title: card.title,
    fonts: fonts.map((font) => ({
      name: font.name,
      data: Buffer.from(font.data).toString("base64"),
      style: font.style,
      weight: font.weight,
    })),
  };
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
