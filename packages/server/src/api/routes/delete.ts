import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteQuerySchema,
  S3_API_ROUTES,
  type DeleteResponse,
} from "@dimah-s3/core";
import {
  headObjectOrNotFound,
  resolveRequestTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleDelete(
  config: ResolvedDimahS3Config,
  input: typeof deleteQuerySchema._output,
  request: Request,
): Promise<DeleteResponse> {
  const { key, bucket } = await resolveRequestTarget(config, config.delete, {
    request,
    key: input.key,
    bucket: input.bucket,
  });

  await runHook(config.delete?.guard, {
    request,
    key,
    bucket,
  });

  await headObjectOrNotFound(config.client, bucket, key);

  await config.client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );

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
