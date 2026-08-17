import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteQuerySchema,
  S3_API_ROUTES,
  type DeleteResponse,
} from "@dimah-s3/core";
import { errors } from "../../errors";
import { isAwsNotFound } from "../../helpers";
import { runHook, runLifecycleHook } from "../../internal-helpers";
import type { DimahS3Config } from "../../types";
import { assertFeatureEnabled } from "../assert-feature-enabled";
import { createS3Endpoint } from "../create-s3-endpoint";

async function handleDelete(
  config: DimahS3Config,
  input: typeof deleteQuerySchema._output,
  request: Request,
): Promise<DeleteResponse> {
  const key = input.key;
  const bucket = input.bucket ?? config.defaultBucket;

  await runHook(config.delete?.guard, {
    request,
    key,
    bucket,
  });

  try {
    await config.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    if (isAwsNotFound(err)) {
      throw errors.objectNotFound();
    }
    throw err;
  }

  await config.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  await runLifecycleHook(config.delete?.onDeleted, { request, key, bucket });

  return { success: true, bucket, key };
}

export const deleteObject = createS3Endpoint(
  S3_API_ROUTES.delete,
  { method: "DELETE", query: deleteQuerySchema },
  async (ctx) => {
    assertFeatureEnabled(ctx.context.config, "delete");
    return handleDelete(ctx.context.config, ctx.query, ctx.context.request);
  },
);
