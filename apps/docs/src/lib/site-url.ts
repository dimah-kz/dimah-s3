/** Canonical production origin. Preview deploys still use VERCEL_URL. */
export const PRODUCTION_SITE_ORIGIN = "https://s3.dimah.dev";

/**
 * Canonical site origin for metadata, OG images, and absolute URLs.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_SITE_URL — optional override (local tunnel, etc.)
 * 2. PRODUCTION_SITE_ORIGIN — production deploy on Vercel
 * 3. VERCEL_URL — preview *.vercel.app
 * 4. http://localhost:3000 — local dev
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return new URL(explicit.includes("://") ? explicit : `https://${explicit}`);
  }

  if (process.env.VERCEL_ENV === "production") {
    return new URL(PRODUCTION_SITE_ORIGIN);
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return new URL(`https://${vercelHost}`);
  }

  const port = process.env.PORT ?? "3000";
  return new URL(`http://localhost:${port}`);
}
