import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildContentDisposition,
  downloadQuerySchema,
  S3_API_ROUTES,
  type DownloadPresignResponse,
} from "@dimah-s3/core";
import {
  headObjectOrNotFound,
  normalizeExpiresIn,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleDownload(
  config: ResolvedDimahS3Config,
  input: typeof downloadQuerySchema._output,
  request: Request,
): Promise<DownloadPresignResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "download",
  );
  const expiresIn = normalizeExpiresIn(
    route.download.expiresIn,
    config.maxExpiresIn,
  );
  const fileName = input.fileName;

  await runHook(route.download.guard, {
    ...stored,
    fileName,
  });

  await headObjectOrNotFound(route.client, bucket, key);

  const url = await getSignedUrl(
    route.client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: fileName
        ? buildContentDisposition(fileName)
        : "attachment",
    }),
    { expiresIn },
  );

  await runLifecycleHook(route.download.onPresigned, {
    ...stored,
    fileName,
    url,
    expiresIn,
  });

  return { bucket, key, url, expiresIn };
}

export const download = createS3Endpoint(
  S3_API_ROUTES.download,
  { method: "GET", query: downloadQuerySchema },
  async (ctx) => {
    return handleDownload(ctx.context.config, ctx.query, ctx.context.request);
  },
);
