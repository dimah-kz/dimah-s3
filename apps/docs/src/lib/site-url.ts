/** Canonical production origin. Preview deploys still use VERCEL_URL. */
export const PRODUCTION_SITE_ORIGIN = "https://s3.dimah.dev";

export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Canonical site origin for metadata, OG images, and absolute URLs.
 *
 * Production always uses PRODUCTION_SITE_ORIGIN so a stale
 * NEXT_PUBLIC_SITE_URL or Vercel primary domain cannot rewrite canonicals.
 *
 * Otherwise:
 * 1. NEXT_PUBLIC_SITE_URL — optional override (local tunnel, etc.)
 * 2. VERCEL_URL — preview *.vercel.app
 * 3. http://localhost:3000 — local dev
 */
export function getSiteUrl(): URL {
  if (isProductionDeploy()) {
    return new URL(PRODUCTION_SITE_ORIGIN);
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return new URL(explicit.includes("://") ? explicit : `https://${explicit}`);
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return new URL(`https://${vercelHost}`);
  }

  const port = process.env.PORT ?? "3000";
  return new URL(`http://localhost:${port}`);
}
