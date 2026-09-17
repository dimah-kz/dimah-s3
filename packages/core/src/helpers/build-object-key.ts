export function buildObjectKey(...parts: string[]): string {
  return parts
    .map((p) => p.replaceAll(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
