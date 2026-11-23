import { cacheLife } from "next/cache";
import { AppIcon } from "@/components/og/app-icon";
import { renderImage } from "@/components/og/render-image";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default async function Icon() {
  return new Response(await renderIcon(), {
    headers: { "Content-Type": contentType },
  });
}

// Cached, so the build prerenders it.
async function renderIcon() {
  "use cache";
  cacheLife("max");

  return renderImage(<AppIcon size={size.width} />, size);
}
