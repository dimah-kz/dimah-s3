import { cacheLife } from "next/cache";
import { HeroCard } from "@/components/og/hero-card";
import { ogSize } from "@/components/og/og-card";
import { renderImage } from "@/components/og/render-image";
import { siteTitle } from "@/lib/shared";

/**
 * The site's share image: the landing hero. Docs pages and blog posts set
 * their own (`/og/docs/…`, `/og/blog/…`); every other route shares this one.
 */
export const alt = siteTitle;
export const size = ogSize;
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new Response(await renderSiteImage(), {
    headers: { "Content-Type": contentType },
  });
}

// Cached, so the build prerenders it. Its copy changes only with a deploy.
async function renderSiteImage() {
  "use cache";
  cacheLife("max");

  return renderImage(<HeroCard />, size);
}
