import {
  CreateMultipartUploadCommand,
  type CreateMultipartUploadCommandOutput,
} from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  multipartInitBodySchema,
  S3_API_ROUTES,
  type MultipartInitResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import { errors } from "@/errors";
import {
  abortMultipartBestEffort,
  normalizeObjectS3,
  objectCommandExtras,
  openUploadTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleMultipartInit(
  config: ResolvedDimahS3Config,
  input: z.output<typeof multipartInitBodySchema>,
  request: Request,
): Promise<MultipartInitResponse> {
  const fileSize = Math.floor(input.fileSize);
  const fileName = input.fileName;
  const {
    route,
    key,
    bucket,
    metadata,
    acl,
    storageClass,
    cacheControl,
    tagging,
    stored,
  } = await openUploadTarget(
    config,
    {
      route: input.route,
      fileName,
      fileSize,
      contentType: input.contentType,
      metadata: input.metadata,
    },
    request,
    "multipart",
  );

  const objectS3 = normalizeObjectS3({ storageClass, cacheControl, tagging });

  await runHook(route.upload.guard, {
    ...stored,
    file: {
      name: fileName,
      size: fileSize,
      type: input.contentType,
    },
    metadata,
    clientMetadata: input.metadata,
    acl,
    ...objectS3,
    replace: route.upload.replace,
  });

  const { UploadId } = (await route.client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentDisposition: buildContentDisposition(fileName),
      Metadata: metadata,
      ACL: acl,
      ...objectCommandExtras(objectS3),
    }),
  )) as CreateMultipartUploadCommandOutput;

  if (!UploadId) {
    throw errors.internalError();
  }

  try {
    await runLifecycleHook(
      route.upload.multipart.onInit,
      {
        ...stored,
        uploadId: UploadId,
        file: {
          name: fileName,
          size: fileSize,
          type: input.contentType,
        },
        metadata,
        clientMetadata: input.metadata,
        acl,
        ...objectS3,
        replace: route.upload.replace,
      },
      config,
    );
  } catch (err) {
    await abortMultipartBestEffort(route.client, bucket, key, UploadId);
    try {
      await runLifecycleHook(
        route.upload.multipart.onAbort,
        {
          ...stored,
          uploadId: UploadId,
        },
        config,
      );
    } catch {
      // Compensation must not mask the original onInit error.
    }
    throw err;
  }

  return { bucket, key, uploadId: UploadId };
}

export const multipartInit = createS3Endpoint(
  S3_API_ROUTES.multipartInit,
  { method: "POST", body: multipartInitBodySchema },
  async (ctx) => {
    const result = await handleMultipartInit(
      ctx.context.config,
      ctx.body,
      ctx.context.request,
    );
    ctx.setStatus(201);
    return result;
  },
);
