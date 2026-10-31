import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3_API_ROUTES,
  type downloadQuerySchema,
  type DownloadPresignResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import { clampDownloadExpiresIn } from "@/helpers/expires";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { resolveObjectDisposition } from "@/helpers/inline-types";
import { openObject } from "@/helpers/resolve-route";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { DownloadGuardContext } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";

/** Query of `GET /presign/download`, after validation. */
export type DownloadQuery = z.output<typeof downloadQuerySchema>;

/**
 * Presigns a download (`GET /presign/download`, `s3.api.download`).
 *
 * After the route guard, `download.resolve` can change the name, the
 * disposition and the TTL, and `download.guard` sees the values that will
 * be used. HeadObject then reads the stored type, and `inline` is kept only
 * for a type on the route's `inlineTypes`. In presign mode the URL is a
 * signed GetObject. In proxy mode it is the `/file` URL, relative to the API
 * unless `baseURL` is set, and has no `expiresIn`. `download.onPresigned`
 * runs last with the URL and the disposition that was sent.
 */
export function presignDownload(
  config: ResolvedConfig,
  query: DownloadQuery,
  options: S3ServerCallOptions = {},
): Promise<DownloadPresignResponse> {
  return runOperation(config, "download", options, async (call) => {
    const { route, context } = await openObject(
      config,
      call,
      query,
      "download",
    );
    const { download } = route;
    const { mode } = download;
    const presign = mode === "presign";
    const requested = query.disposition ?? download.disposition;
    const resolved =
      (await download.resolve?.({
        ...context,
        mode,
        name: query.name,
        disposition: requested,
        expiresIn: presign ? query.expiresIn : undefined,
      })) ?? undefined;

    const guardContext: DownloadGuardContext = {
      ...context,
      mode,
      name: resolved?.name ?? query.name,
      disposition: resolved?.disposition ?? requested,
      expiresIn: presign
        ? clampDownloadExpiresIn({
            requested: query.expiresIn,
            resolved: resolved?.expiresIn,
            routeMaxExpiresIn: download.maxExpiresIn,
            maxExpiresIn: config.maxExpiresIn,
          })
        : undefined,
    };
    await runGuards(download.guard, guardContext);

    const { bucket, key } = context;
    const head = await headObjectOrNotFound(route.client, bucket, key, {
      abortSignal: call.request.signal,
    });
    const sent = resolveObjectDisposition(download.inlineTypes, {
      key,
      name: guardContext.name,
      requested: guardContext.disposition,
      contentType: head.ContentType,
      contentDisposition: head.ContentDisposition,
    });

    const url = presign
      ? await getSignedUrl(
          route.client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: sent.header,
            ResponseContentType: sent.contentType,
          }),
          { expiresIn: guardContext.expiresIn },
        )
      : proxyUrl(config, {
          route: route.name,
          key,
          name: guardContext.name,
          disposition: sent.disposition,
        });

    await runLifecycle(download.onPresigned, {
      ...guardContext,
      disposition: sent.disposition,
      url,
    });

    return {
      key,
      bucket,
      url,
      mode,
      disposition: sent.disposition,
      ...(guardContext.expiresIn !== undefined
        ? { expiresIn: guardContext.expiresIn }
        : {}),
    };
  });
}

/** The `/file` URL under `baseURL` when set, else under `basePath`. */
function proxyUrl(
  config: Pick<ResolvedConfig, "basePath" | "baseURL">,
  query: { route: string; key: string; name?: string; disposition: string },
): string {
  const params = new URLSearchParams({ route: query.route, key: query.key });
  if (query.name !== undefined) params.set("name", query.name);
  params.set("disposition", query.disposition);
  const base = (config.baseURL ?? config.basePath).replace(/\/+$/, "");
  return `${base}${S3_API_ROUTES.file}?${params}`;
}
