import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  multipartSignPartBodySchema,
  S3_API_ROUTES,
  type MultipartPartResponse,
} from "@dimah-s3/core";
import {
  assertWithinMaxFileSize,
  listAllParts,
  listedPartsByteSize,
  normalizeExpiresIn,
  openStoredTarget,
  runHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleSignPart(
  config: ResolvedDimahS3Config,
  input: typeof multipartSignPartBodySchema._output,
  request: Request,
): Promise<MultipartPartResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;
  const partNumber = input.partNumber;
  const expiresIn = normalizeExpiresIn(
    route.upload.expiresIn,
    config.maxExpiresIn,
  );
  const partSize = Math.floor(input.partSize);

  await runHook(route.upload.multipart.sessionGuard, {
    ...stored,
    uploadId,
    action: "part",
    partNumber,
    partSize,
  });

  const maxFileSize = route.upload.maxFileSize;
  assertWithinMaxFileSize(maxFileSize, partSize);
  if (typeof maxFileSize === "number") {
    const listed = await listAllParts(route.client, { bucket, key, uploadId });
    assertWithinMaxFileSize(
      maxFileSize,
      listedPartsByteSize(listed, partNumber) + partSize,
    );
  }

  const url = await getSignedUrl(
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
    url,
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
