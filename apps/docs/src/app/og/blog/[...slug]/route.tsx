import { cacheLife } from "next/cache";
import { DocsCard } from "@/components/og/docs-card";
import { blog, blogDescription, getBlogPageImage } from "@/lib/blog";
import { ogFonts } from "@/lib/og-fonts";
import { appName } from "@/lib/shared";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/blog/[...slug]">,
) {
  const { slug } = await params;
  const payload = await ogPayload(slug);
  if (!payload) notFound();

  return new ImageResponse(
    <DocsCard
      brand={payload.brand}
      description={payload.description}
      label={payload.label}
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

  const card = ogCard(slug);
  if (!card) return null;

  const fonts = await ogFonts();

  return {
    brand: appName,
    description: card.description,
    label: "Blog",
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
  return [
    { slug: ["image.png"] },
    ...blog.getPages().map((page) => ({
      slug: getBlogPageImage(page).segments,
    })),
  ];
}

function ogCard(slug: string[]) {
  if (slug.length === 1 && slug[0] === "image.png") {
    return {
      title: "Blog",
      description: blogDescription,
    };
  }

  const page = blog.getPage(slug.slice(0, -1));
  if (!page) return null;

  const text = (page.data.description ?? "").replaceAll("`", "").trim();

  return {
    title: page.data.title,
    description: text || undefined,
  };
}
