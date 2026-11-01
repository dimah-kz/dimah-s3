import type { ContentDispositionType } from "@dimah-s3/core";
import { ConfigError } from "@/helpers/error-boundary";
import { runGuards } from "@/helpers/hooks";
import type {
  DownloadGuardContext,
  DownloadResolveInfo,
  ObjectContext,
} from "@/types/hook-contexts";
import type { OpenedRoute, ResolvedConfig } from "@/types/resolved";

/** What the client asked for: the download query or the `/file` query. */
export type DownloadRequest = {
  mode: "presign" | "proxy";
  name?: string;
  disposition?: ContentDispositionType;
  /** Presign mode only. */
  expiresIn?: number;
};

export type AuthorizedDownload = {
  /** The values that will be used, as `download.guard` saw them. */
  context: DownloadGuardContext;
  /** What `download.resolve` returned. */
  resolved?: DownloadResolveInfo;
};

/**
 * The download steps that presign and `/file` share, after the route
 * guard: `download.resolve` can replace the name, the disposition and the
 * TTL, and `download.guard` then runs with the values that will be used.
 * In proxy mode the contexts have no `expiresIn`.
 */
export async function authorizeDownload(
  config: Pick<ResolvedConfig, "maxExpiresIn">,
  route: OpenedRoute<"download">,
  context: ObjectContext,
  request: DownloadRequest,
): Promise<AuthorizedDownload> {
  const { download } = route;
  const presign = request.mode === "presign";
  const requested = request.disposition ?? download.disposition;
  const resolved =
    (await download.resolve?.({
      ...context,
      mode: request.mode,
      name: request.name,
      disposition: requested,
      ...(presign ? { expiresIn: request.expiresIn } : {}),
    })) ?? undefined;

  const guardContext: DownloadGuardContext = {
    ...context,
    mode: request.mode,
    name: resolved?.name ?? request.name,
    disposition: resolved?.disposition ?? requested,
    ...(presign
      ? {
          expiresIn: signedExpiresIn(
            request.expiresIn,
            resolved?.expiresIn,
            download.maxExpiresIn,
            config.maxExpiresIn,
          ),
        }
      : {}),
  };
  await runGuards(download.guard, guardContext);
  return { context: guardContext, resolved };
}

/**
 * The signed TTL in seconds. A `download.resolve` value wins, capped by the
 * instance `maxExpiresIn`; anything but a positive integer there is a
 * config error. Otherwise the client value (already a positive integer) is
 * used up to the route `download.maxExpiresIn`, which is the default.
 */
function signedExpiresIn(
  requested: number | undefined,
  resolved: number | undefined,
  routeMaxExpiresIn: number,
  maxExpiresIn: number,
): number {
  if (resolved !== undefined) {
    if (!Number.isSafeInteger(resolved) || resolved <= 0) {
      throw new ConfigError(
        `download.resolve returned expiresIn ${String(resolved)}; return a positive integer of seconds.`,
      );
    }
    return Math.min(resolved, maxExpiresIn);
  }
  return Math.min(requested ?? routeMaxExpiresIn, routeMaxExpiresIn);
}
