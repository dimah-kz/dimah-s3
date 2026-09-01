import {
  CompleteMultipartUploadCommand,
  type CompleteMultipartUploadCommandOutput,
} from "@aws-sdk/client-s3";
import {
  multipartCompleteBodySchema,
  S3_API_ROUTES,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import { errors } from "@/errors";
import {
  abortMultipartBestEffort,
  assertWithinMaxFileSize,
  finalizeConfirmedObject,
  headObjectAfterMultipartComplete,
  listAllParts,
  openStoredTarget,
  runHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleComplete(
  config: ResolvedDimahS3Config,
  input: z.output<typeof multipartCompleteBodySchema>,
  request: Request,
): Promise<MultipartCompleteResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;
  const parts = [
    ...new Set(input.parts.map(({ partNumber }) => partNumber)),
  ].sort((a, b) => a - b);
  const partRefs = parts.map((partNumber) => ({ partNumber }));

  await runHook(route.upload.multipart.guard, {
    ...stored,
    uploadId,
    action: "complete",
  });
  await runHook(route.upload.confirmGuard, {
    ...stored,
    uploadId,
    parts: partRefs,
    replace: route.upload.replace,
  });

  const listedParts = await listAllParts(route.client, {
    bucket,
    key,
    uploadId,
  });

  let assembledBytes = 0;
  const completeParts = parts.map((partNumber) => {
    const found = listedParts.find((p) => p.PartNumber === partNumber);
    if (!found?.ETag) {
      throw errors.multipartPartMissing(partNumber);
    }
    assembledBytes += found.Size ?? 0;
    return { PartNumber: partNumber, ETag: found.ETag };
  });

  try {
    assertWithinMaxFileSize(route.upload.maxFileSize, assembledBytes);
  } catch (err) {
    await abortMultipartBestEffort(route.client, bucket, key, uploadId);
    throw err;
  }

  const completeResult: CompleteMultipartUploadCommandOutput =
    await sendOrObjectNotFound(() =>
      route.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: completeParts },
        }),
      ),
    );

  const head = await headObjectAfterMultipartComplete(
    route.client,
    bucket,
    key,
  );
  const confirmed = await finalizeConfirmedObject(route.client, bucket, key, {
    config,
    route,
    stored,
    head: {
      ...head,
      ETag: head.ETag ?? completeResult.ETag,
    },
    uploadId,
    acl: route.upload.acl,
  });

  return { ...confirmed, uploadId };
}

export const multipartComplete = createS3Endpoint(
  S3_API_ROUTES.multipartComplete,
  { method: "POST", body: multipartCompleteBodySchema },
  async (ctx) => {
    return handleComplete(ctx.context.config, ctx.body, ctx.context.request);
  },
);
