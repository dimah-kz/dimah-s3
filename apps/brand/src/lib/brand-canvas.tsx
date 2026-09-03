"use client";

import { createElement, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { itemId, TWEET_LANDSCAPE, type BrandItem } from "@/catalog";
import { AttachmentTweetStill } from "@/sections/attachment/stills/tweet";

const AttachmentTweetVideo = dynamic(
  () =>
    import("@/sections/attachment/videos/tweet").then(
      (mod) => mod.AttachmentTweetVideo,
    ),
  {
    ssr: false,
    loading: () =>
      createElement("div", {
        style: {
          width: TWEET_LANDSCAPE.width,
          height: TWEET_LANDSCAPE.height,
          backgroundColor: "#fafafa",
        },
      }),
  },
);

const brandFrames = {
  "attachment/stills/tweet": AttachmentTweetStill,
  "attachment/videos/tweet": AttachmentTweetVideo,
} as const satisfies Record<string, ComponentType>;

export function BrandCanvas({
  item,
}: {
  item: Pick<BrandItem, "section" | "kind" | "slug">;
}) {
  const Frame = brandFrames[itemId(item) as keyof typeof brandFrames];
  if (!Frame) return null;
  return createElement(Frame);
}
