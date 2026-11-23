import { cacheLife } from "next/cache";
import { AppIcon } from "@/components/og/app-icon";
import { renderImage } from "@/components/og/render-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new Response(await renderAppleIcon(), {
    headers: { "Content-Type": contentType },
  });
}

// Cached, so the build prerenders it.
async function renderAppleIcon() {
  "use cache";
  cacheLife("max");

  return renderImage(<AppIcon size={size.width} />, size);
}
