import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildContentDisposition,
  downloadQuerySchema,
  S3_API_ROUTES,
  type DownloadPresignResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import {
  headObjectOrNotFound,
  normalizeExpiresIn,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

function fileUrl(
  request: Request,
  basePath: string,
  query: {
    route: string;
    key: string;
    fileName?: string;
    disposition?: string;
  },
): string {
  const url = new URL(request.url);
  const prefix = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  url.pathname = `${prefix}${S3_API_ROUTES.file}`;
  url.search = "";
  url.searchParams.set("route", query.route);
  url.searchParams.set("key", query.key);
  if (query.fileName) url.searchParams.set("fileName", query.fileName);
  if (query.disposition) url.searchParams.set("disposition", query.disposition);
  return url.toString();
}

async function handleDownload(
  config: ResolvedDimahS3Config,
  input: z.output<typeof downloadQuerySchema>,
  request: Request,
): Promise<DownloadPresignResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "download",
  );

  const resolved = await route.download.resolve?.({
    ...stored,
    fileName: input.fileName,
    disposition: input.disposition ?? route.download.disposition,
  });

  const fileName = resolved?.fileName ?? input.fileName;
  const disposition =
    resolved?.disposition ??
    input.disposition ??
    route.download.disposition ??
    "attachment";
  const expiresIn = normalizeExpiresIn(
    resolved?.expiresIn ?? route.download.expiresIn,
    config.maxExpiresIn,
  );

  await runHook(route.download.guard, {
    ...stored,
    fileName,
    disposition,
  });

  await headObjectOrNotFound(route.client, bucket, key);

  const mode = route.download.mode ?? "presign";
  const contentDisposition = fileName
    ? buildContentDisposition(fileName, disposition)
    : disposition;

  const url =
    mode === "proxy"
      ? fileUrl(request, config.basePath ?? "/api/s3", {
          route: input.route,
          key,
          fileName,
          disposition,
        })
      : await getSignedUrl(
          route.client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: contentDisposition,
          }),
          { expiresIn },
        );

  await runLifecycleHook(
    route.download.onPresigned,
    {
      ...stored,
      fileName,
      url,
      expiresIn: mode === "proxy" ? 0 : expiresIn,
    },
    config,
  );

  return {
    bucket,
    key,
    url,
    expiresIn: mode === "proxy" ? 0 : expiresIn,
    mode,
    disposition,
  };
}

export const download = createS3Endpoint(
  S3_API_ROUTES.download,
  { method: "GET", query: downloadQuerySchema },
  async (ctx) => {
    return handleDownload(ctx.context.config, ctx.query, ctx.context.request);
  },
);
