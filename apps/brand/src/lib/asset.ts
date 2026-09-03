import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrandItem } from "@/catalog";

const publicRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public",
);

export function itemAssetFile(item: BrandItem) {
  return path.join(
    publicRoot,
    item.section,
    item.kind,
    `${item.slug}.${item.ext}`,
  );
}

export function itemAssetExists(item: BrandItem) {
  return existsSync(itemAssetFile(item));
}
