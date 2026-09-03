import { itemId, type BrandItem } from "@/catalog";

const brandFrameIds = new Set([
  "attachment/stills/tweet",
  "attachment/videos/tweet",
]);

export function getBrandFrame(
  item: Pick<BrandItem, "section" | "kind" | "slug">,
) {
  return brandFrameIds.has(itemId(item));
}
