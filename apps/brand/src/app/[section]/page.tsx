import Link from "next/link";
import { notFound } from "next/navigation";
import { brandSectionIds, getBrandSection, itemsFor } from "@/catalog";
import { BrandKindList } from "@/lib/item-row";

export function generateStaticParams() {
  return brandSectionIds.map((section) => ({ section }));
}

export default async function BrandSectionPage({
  params,
}: PageProps<"/[section]">) {
  const { section: sectionId } = await params;
  const section = getBrandSection(sectionId);
  if (!section) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          Brand
        </Link>
        <span className="mx-1.5">/</span>
        {section.title}
      </p>
      <h1 className="text-lg font-semibold tracking-tight">{section.title}</h1>
      <BrandKindList
        kind="stills"
        items={itemsFor(section.id, "stills")}
        empty={`Add a still at src/sections/${section.id}/stills/{slug}.tsx`}
      />
      <BrandKindList
        kind="videos"
        items={itemsFor(section.id, "videos")}
        empty={`Add a framecn video at src/sections/${section.id}/videos/{slug}.tsx`}
      />
    </main>
  );
}
