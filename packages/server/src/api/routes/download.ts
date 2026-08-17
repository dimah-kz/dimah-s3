import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildContentDisposition,
  downloadQuerySchema,
  S3_API_ROUTES,
  type PresignResponse,
} from "@dimah-s3/core";
import { errors } from "../../errors";
import { isAwsNotFound } from "../../helpers";
import {
  normalizeExpiresIn,
  runHook,
  runLifecycleHook,
} from "../../internal-helpers";
import type { DimahS3Config } from "../../types";
import { assertFeatureEnabled } from "../assert-feature-enabled";
import { createS3Endpoint } from "../create-s3-endpoint";

async function handleDownload(
  config: DimahS3Config,
  input: typeof downloadQuerySchema._output,
  request: Request,
): Promise<PresignResponse> {
  const key = input.key;
  const bucket = input.bucket ?? config.defaultBucket;
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const fileName = input.fileName;

  await runHook(config.download?.presignGuard, {
    request,
    key,
    bucket,
    fileName,
  });

  try {
    await config.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    if (isAwsNotFound(err)) {
      throw errors.objectNotFound();
    }
    throw err;
  }

  const url = await getSignedUrl(
    config.s3,
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
