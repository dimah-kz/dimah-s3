import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3_API_ROUTES,
  type ContentDispositionType,
  type DownloadPresignResponse,
} from "@dimah-s3/core";
import type { downloadQuerySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { authorizeDownload } from "@/helpers/authorize-download";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { runLifecycle } from "@/helpers/hooks";
import { resolveObjectDisposition } from "@/helpers/inline-types";
import { openObject } from "@/helpers/open-target";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ObjectContext } from "@/types/hook-contexts";
import type { OpenedRoute, ResolvedConfig } from "@/types/resolved";

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
    const { context: guardContext } = await authorizeDownload(
      config,
      route,
      context,
      {
        mode,
        name: query.name,
        disposition: query.disposition,
        expiresIn: query.expiresIn,
      },
    );

    const { bucket, key } = context;
    let url: string;
    let disposition: ContentDispositionType;
    if (presign) {
      ({ url, disposition } = await signObjectUrl(
        route,
        context,
        {
          name: guardContext.name,
          disposition: guardContext.disposition,
          expiresIn: guardContext.expiresIn ?? download.maxExpiresIn,
        },
        call.request.signal,
      ));
    } else {
      // The disposition `/file` will send depends on the stored type.
      const head = await headObjectOrNotFound(route.client, bucket, key, {
        abortSignal: call.request.signal,
      });
      ({ disposition } = resolveObjectDisposition(download.inlineTypes, {
        key,
        name: guardContext.name,
        requested: guardContext.disposition,
        contentType: head.ContentType,
        contentDisposition: head.ContentDisposition,
      }));
      url = proxyUrl(config, {
        route: route.name,
        key,
        name: guardContext.name,
        disposition,
      });
    }

    await runLifecycle(download.onPresigned, {
      ...guardContext,
      disposition,
      url,
    });

    const base = { key, bucket, url, disposition };
    return guardContext.expiresIn === undefined
      ? { ...base, mode: "proxy" }
      : { ...base, mode: "presign", expiresIn: guardContext.expiresIn };
  });
}

/** How {@link signObjectUrl} signs the GET. */
export type SignObjectUrlOptions = {
  /** File name for `Content-Disposition`. Defaults to the stored one, else the key. */
  name?: string;
  /** Kept `inline` only for a type on the route's `inlineTypes`. */
  disposition: ContentDispositionType;
  /** URL lifetime in seconds. */
  expiresIn: number;
};

/**
 * A presigned GetObject for an object the caller may read, after every
 * check. HeadObject reads the stored type first, so `inline` is kept only
 * for a type on the route's `inlineTypes`, and a missing object fails with
 * `OBJECT_NOT_FOUND`. Returns the URL and the disposition it carries.
 */
export async function signObjectUrl(
  route: OpenedRoute<"download">,
  target: Pick<ObjectContext, "bucket" | "key">,
  options: SignObjectUrlOptions,
  abortSignal?: AbortSignal,
): Promise<{ url: string; disposition: ContentDispositionType }> {
  const { bucket, key } = target;
  const head = await headObjectOrNotFound(route.client, bucket, key, {
    abortSignal,
  });
  const sent = resolveObjectDisposition(route.download.inlineTypes, {
    key,
    name: options.name,
    requested: options.disposition,
    contentType: head.ContentType,
    contentDisposition: head.ContentDisposition,
  });
  const url = await getSignedUrl(
    route.client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: sent.header,
      ResponseContentType: sent.contentType,
    }),
    { expiresIn: options.expiresIn },
  );
  return { url, disposition: sent.disposition };
}

/** The `/file` URL under `baseURL` when set, else under `basePath`. */
function proxyUrl(
  config: Pick<ResolvedConfig, "basePath" | "baseURL">,
  query: { route: string; key: string; name?: string; disposition: string },
): string {
  const params = new URLSearchParams({ route: query.route, key: query.key });
  if (query.name !== undefined) params.set("name", query.name);
  params.set("disposition", query.disposition);
  // Both are normalized without a trailing slash.
  const base = config.baseURL ?? config.basePath;
  return `${base}${S3_API_ROUTES.file}?${params}`;
}
