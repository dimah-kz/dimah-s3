import Link from "next/link";
import { notFound } from "next/navigation";
import {
  brandItems,
  getBrandItem,
  getBrandSection,
  itemHref,
  itemVideoId,
} from "@/catalog";
import { BrandAssetDownload } from "@/lib/asset-download";
import { BrandCanvas } from "@/lib/brand-canvas";
import { BrandVideoDownload } from "@/lib/video-download";
import { BrandVideoControls } from "@/lib/video-controls";
import { getBrandFrame } from "@/registry";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return brandItems.map((item) => ({
    section: item.section,
    kind: item.kind,
    slug: item.slug,
  }));
}

export default async function BrandItemPage({
  params,
  searchParams,
}: PageProps<"/[section]/[kind]/[slug]">) {
  const { section, kind, slug } = await params;
  const query = await searchParams;
  const item = getBrandItem(section, kind, slug);
  const meta = getBrandSection(section);
  if (!item || !meta || !getBrandFrame(item)) notFound();

  const exporting = Object.hasOwn(query, "export");
  if (exporting) return <BrandCanvas item={item} />;

  return (
    <main className="mx-auto flex w-full max-w-300 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/" className="hover:underline">
              Brand
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={`/${item.section}`} className="hover:underline">
              {meta.title}
            </Link>
            <span className="mx-1.5">/</span>
            {item.title}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            {item.section}/{item.kind}/{item.slug} · {item.size.width}×
            {item.size.height}
            {"fps" in item && item.fps ? ` · ${String(item.fps)}fps` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.kind === "stills" ? (
            <Link
              href={`${itemHref(item)}?export`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Export
            </Link>
          ) : null}
          {item.kind === "videos" ? (
            <BrandVideoDownload
              target={itemVideoId(item)}
              fps={item.fps ?? 30}
              width={item.size.width}
              height={item.size.height}
              filename={`${item.slug}.mp4`}
            />
          ) : (
            <BrandAssetDownload
              item={item}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            />
          )}
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
        <BrandCanvas item={item} />
        {item.kind === "videos" ? (
          <BrandVideoControls target={itemVideoId(item)} />
        ) : null}
      </div>
    </main>
  );
}
