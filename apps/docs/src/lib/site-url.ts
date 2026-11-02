/** Canonical production origin. Preview deploys still use VERCEL_URL. */
export const PRODUCTION_SITE_ORIGIN = "https://s3.dimah.dev";

/** Public docs for the 2.0 beta, deployed from the `v2` branch. */
export const BETA_SITE_ORIGIN = "https://v2.s3.dimah.dev";

export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** Vercel sets this on both Production and Preview builds of the `v2` branch. */
export function isV2BetaDeploy(): boolean {
  return process.env.VERCEL_GIT_COMMIT_REF === "v2";
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
  // The beta site is public even when its Vercel environment is Preview.
  if (isV2BetaDeploy()) {
    return new URL(BETA_SITE_ORIGIN);
  }

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

/**
 * Absolute URL that should be indexed.
 * Paths have no trailing slash. `/` is the bare origin, matching the
 * canonical Next resolves for `alternates.canonical: "/"`.
 */
export function canonicalUrl(pathname = "/"): string {
  const origin = getSiteUrl().origin;
  if (pathname === "" || pathname === "/") return origin;

  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${origin}${path.replace(/\/+$/, "")}`;
}
