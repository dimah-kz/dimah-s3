import type { DimahS3Config } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/**
 * Router context key of the resolved config. Plugin endpoints see only the
 * user `config`; the core endpoints and the error boundary read this one.
 * `Symbol.for` keeps one key across the entry points, which are bundled
 * separately.
 */
const RESOLVED_CONFIG: unique symbol = Symbol.for("dimah-s3.resolved-config");

/** What the dimahS3 router injects into every endpoint's `ctx.context`. */
export type RouterContext = {
  config: Readonly<DimahS3Config>;
  [RESOLVED_CONFIG]: ResolvedConfig;
};

/** The router context for the user config and its resolved form. */
export function createRouterContext(
  config: Readonly<DimahS3Config>,
  resolved: ResolvedConfig,
): RouterContext {
  return { config, [RESOLVED_CONFIG]: resolved };
}

/**
 * The resolved config in an endpoint's `ctx.context`. Throws when the
 * endpoint is called outside a dimahS3 router.
 */
export function resolvedConfig(context: object): ResolvedConfig {
  const resolved = (context as Partial<RouterContext>)[RESOLVED_CONFIG];
  if (!resolved) {
    throw new Error(
      "createS3Endpoint needs the dimahS3 router context. Mount the endpoint as a plugin endpoint and call it through the HTTP handler.",
    );
  }
  return resolved;
}
