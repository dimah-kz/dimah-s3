import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  multipartSignPartBodySchema,
  S3_API_ROUTES,
  type MultipartPartResponse,
} from "@dimah-s3/core";
import {
  assertWithinMaxFileSize,
  getResolvedRoute,
  listAllParts,
  listedPartsByteSize,
  normalizeExpiresIn,
  resolveStoredTarget,
  runHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleSignPart(
  config: ResolvedDimahS3Config,
  input: typeof multipartSignPartBodySchema._output,
  request: Request,
): Promise<MultipartPartResponse> {
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "multipart");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, input.key);
  const uploadId = input.uploadId;
  const partNumber = input.partNumber;
  const expiresIn = normalizeExpiresIn(route.expiresIn, config.maxExpiresIn);
  const partSize = Math.floor(input.partSize);

  await runHook(route.upload?.multipart?.sessionGuard, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
    action: "part",
    partNumber,
    partSize,
  });

  assertWithinMaxFileSize(route.maxFileSize, partSize);
  if (route.maxFileSize) {
    const listed = await listAllParts(route.client, { bucket, key, uploadId });
    assertWithinMaxFileSize(
      route.maxFileSize,
      listedPartsByteSize(listed, partNumber) + partSize,
    );
  }

  const presignedUrl = await getSignedUrl(
    route.client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: partSize,
    }),
    {
      expiresIn,
      signableHeaders: new Set(["content-length"]),
    },
  );

  return {
    presignedUrl,
    partNumber,
    uploadId,
    bucket,
    expiresIn,
    partSize,
  };
}

export const multipartPart = createS3Endpoint(
  S3_API_ROUTES.multipartPart,
  { method: "POST", body: multipartSignPartBodySchema },
  async (ctx) => {
    return handleSignPart(ctx.context.config, ctx.body, ctx.context.request);
  },
);
