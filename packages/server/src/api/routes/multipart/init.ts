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
import { errors } from "@/errors";
import {
  assertDeclaredConstraints,
  getResolvedRoute,
  resolveUploadTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleMultipartInit(
  config: ResolvedDimahS3Config,
  input: typeof multipartInitBodySchema._output,
  request: Request,
): Promise<MultipartInitResponse> {
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "multipart");
  await runHook(route.guard, { request, route: route.name });

  const fileSize = Math.floor(input.fileSize);
  const fileName = input.fileName;
  assertDeclaredConstraints(route.upload, {
    fileName,
    fileSize,
    contentType: input.contentType,
  });

  const { key, bucket, metadata, acl } = await resolveUploadTarget(route, {
    request,
    route: route.name,
    file: {
      name: fileName,
      size: fileSize,
      type: input.contentType,
    },
    clientMetadata: input.metadata,
  });

  await runHook(route.upload?.guard, {
    request,
    route: route.name,
    key,
    bucket,
    fileSize,
    contentType: input.contentType,
    metadata,
    clientMetadata: input.metadata,
    acl,
    fileName,
  });

  const { UploadId } = (await route.client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentDisposition: buildContentDisposition(fileName),
      Metadata: metadata,
      ACL: acl,
    }),
  )) as CreateMultipartUploadCommandOutput;

  if (!UploadId) {
    throw errors.internalError();
  }

  await runLifecycleHook(route.upload?.multipart?.onInit, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId: UploadId,
    contentType: input.contentType,
    fileSize,
    metadata,
    clientMetadata: input.metadata,
    acl,
    fileName,
  });

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
