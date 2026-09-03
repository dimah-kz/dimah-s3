import Link from "next/link";
import type { BrandItem, BrandKind } from "@/catalog";
import { itemHref } from "@/catalog";
import { BrandAssetDownload } from "@/lib/asset-download";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BrandItemRow({ item }: { item: BrandItem }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{item.title}</p>
        <p className="text-sm text-zinc-500">{item.caption}</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          {item.section}/{item.kind}/{item.slug} · {item.size.width}×
          {item.size.height}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={itemHref(item)}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          Preview
        </Link>
        {item.kind === "stills" ? (
          <Link
            href={`${itemHref(item)}?export`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Export
          </Link>
        ) : null}
        <BrandAssetDownload
          item={item}
          className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
        />
      </div>
    </li>
  );
}

export function BrandKindList({
  kind,
  items,
  empty,
}: {
  kind: BrandKind;
  items: readonly BrandItem[];
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium capitalize">{kind}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <BrandItemRow key={itemHref(item)} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
