/**
 * Join a public origin (CDN or virtual-hosted S3) with an object key.
 * Does not sign — only for `public-read` objects or a fronting CDN.
 */
export function buildPublicObjectUrl(options: {
  /** Origin with no trailing slash, e.g. `https://cdn.example.com`. */
  baseUrl: string;
  key: string;
}): string {
  const base = options.baseUrl.replace(/\/+$/, "");
  const path = options.key
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${path}`;
}
