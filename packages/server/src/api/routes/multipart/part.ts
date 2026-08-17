import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  multipartSignPartBodySchema,
  S3_API_ROUTES,
  type MultipartPartResponse,
} from "@dimah-s3/core";
import { normalizeExpiresIn, runHook } from "../../../internal-helpers";
import type { DimahS3Config } from "../../../types";
import { assertFeatureEnabled } from "../../assert-feature-enabled";
import { createS3Endpoint } from "../../create-s3-endpoint";

async function handleSignPart(
  config: DimahS3Config,
  input: typeof multipartSignPartBodySchema._output,
  request: Request,
): Promise<MultipartPartResponse> {
  const key = input.key;
  const uploadId = input.uploadId;
  const partNumber = input.partNumber;
  const bucket = input.bucket ?? config.defaultBucket;
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const partSize =
    typeof input.partSize === "number" && input.partSize > 0
      ? Math.floor(input.partSize)
      : null;

  await runHook(config.multipart?.partGuard, {
    request,
    key,
    bucket,
    uploadId,
    partNumber,
    partSize: partSize ?? undefined,
  });

  const presignedUrl = await getSignedUrl(
    config.s3,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ...(partSize !== null ? { ContentLength: partSize } : {}),
    }),
    {
      expiresIn,
      ...(partSize !== null
        ? { signableHeaders: new Set(["content-length"]) }
        : {}),
    },
  );

  return {
    presignedUrl,
    partNumber,
    uploadId,
    bucket,
    expiresIn,
    ...(partSize !== null ? { partSize } : {}),
  };
}

export const multipartPart = createS3Endpoint(
  S3_API_ROUTES.multipartPart,
  { method: "POST", body: multipartSignPartBodySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "multipart");
    return handleSignPart(ctx.context.config, ctx.body, ctx.context.request);
  },
);
