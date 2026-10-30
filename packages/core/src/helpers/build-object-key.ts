import { stripSurroundingSlashes } from "./strip-slashes";

export function buildObjectKey(...parts: string[]): string {
  return parts
    .map((part) => stripSurroundingSlashes(part))
    .filter(Boolean)
    .join("/");
}
