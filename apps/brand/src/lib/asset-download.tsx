import type { BrandItem } from "@/catalog";
import { itemAsset } from "@/catalog";
import { itemAssetExists } from "@/lib/asset";

export function BrandAssetDownload({
  item,
  className,
}: {
  item: BrandItem;
  className?: string;
}) {
  if (!itemAssetExists(item)) return null;

  return (
    <a href={itemAsset(item)} download className={className}>
      {item.ext.toUpperCase()}
    </a>
  );
}
