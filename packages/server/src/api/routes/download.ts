import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildContentDisposition,
  downloadQuerySchema,
  S3_API_ROUTES,
  type PresignResponse,
} from "@dimah-s3/core";
import {
  headObjectOrNotFound,
  normalizeExpiresIn,
  resolveRequestTarget,
  runHook,
  runLifecycleHook,
} from "../../helpers";
import type { ResolvedDimahS3Config } from "../../types";
import { assertFeatureEnabled } from "../assert-feature-enabled";
import { createS3Endpoint } from "../create-s3-endpoint";

async function handleDownload(
  config: ResolvedDimahS3Config,
  input: typeof downloadQuerySchema._output,
  request: Request,
): Promise<PresignResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.download, {
    request,
    key: input.key,
    bucket: input.bucket,
    fileName: input.fileName,
  });
  const expiresIn = normalizeExpiresIn(input.expiresIn, config.maxExpiresIn);
  const fileName = input.fileName;

  await runHook(config.download?.guard, {
    request,
    key,
    bucket,
    fileName,
  });

  await headObjectOrNotFound(config.client, bucket, key);

  const url = await getSignedUrl(
    config.client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: fileName
        ? buildContentDisposition(fileName)
        : "attachment",
    }),
    { expiresIn },
  );

  await runLifecycleHook(config.download?.onPresigned, {
    request,
    key,
    bucket,
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
    assertFeatureEnabled(ctx.context.config, "download");
    return handleDownload(ctx.context.config, ctx.query, ctx.context.request);
  },
);
