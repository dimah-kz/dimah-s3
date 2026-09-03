import Link from "next/link";
import { brandSections, itemsForSection } from "@/catalog";
import { BrandKindList } from "@/lib/item-row";
import { BrandMark } from "@/lib/mark";

export default function BrandIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <h1 className="text-lg font-semibold tracking-tight">Brand studio</h1>
        </div>
        <p className="max-w-prose text-sm text-zinc-500">
          Local promo stills and videos, grouped by product section. Not
          deployed with docs.
        </p>
      </header>

      {brandSections.map((section) => {
        const items = itemsForSection(section.id);
        const stills = items.filter((item) => item.kind === "stills");
        const videos = items.filter((item) => item.kind === "videos");
        return (
          <section key={section.id} className="flex flex-col gap-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">
                {section.title}
              </h2>
              <Link
                href={`/${section.id}`}
                className="text-sm text-zinc-500 hover:underline"
              >
                Open section
              </Link>
            </div>
            <BrandKindList
              kind="stills"
              items={stills}
              empty={`No stills yet — add src/sections/${section.id}/stills/{slug}.tsx`}
            />
            <BrandKindList
              kind="videos"
              items={videos}
              empty={`No videos yet — add src/sections/${section.id}/videos/{slug}.tsx`}
            />
          </section>
        );
      })}
    </main>
  );
}
