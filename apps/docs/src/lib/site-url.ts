/**
 * Canonical site origin for metadata, OG images, and absolute URLs.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_SITE_URL — optional override (custom domain, local tunnel)
 * 2. VERCEL_PROJECT_PRODUCTION_URL — production deploy on Vercel
 * 3. VERCEL_URL — preview / production *.vercel.app
 * 4. http://localhost:3000 — local dev
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return new URL(explicit.includes("://") ? explicit : `https://${explicit}`);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    return new URL(`https://${productionHost}`);
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return new URL(`https://${vercelHost}`);
  }

  const port = process.env.PORT ?? "3000";
  return new URL(`http://localhost:${port}`);
}
