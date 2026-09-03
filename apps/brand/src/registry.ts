import { createElement, type ComponentType } from "react";
import { itemId, type BrandItem } from "@/catalog";
import { AttachmentTweetStill } from "@/sections/attachment/stills/tweet";

export const brandFrames = {
  "attachment/stills/tweet": AttachmentTweetStill,
} as const satisfies Record<string, ComponentType<{ className?: string }>>;

export function getBrandFrame(
  item: Pick<BrandItem, "section" | "kind" | "slug">,
) {
  const key = itemId(item);
  if (Object.hasOwn(brandFrames, key)) {
    return brandFrames[key as keyof typeof brandFrames];
  }
  return undefined;
}

export function BrandCanvas({
  item,
}: {
  item: Pick<BrandItem, "section" | "kind" | "slug">;
}) {
  const Frame = getBrandFrame(item);
  if (!Frame) return null;
  return createElement(Frame);
}
