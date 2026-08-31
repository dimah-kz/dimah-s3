import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteQuerySchema,
  S3_API_ROUTES,
  type DeleteResponse,
} from "@dimah-s3/core";
import {
  headObjectOrNotFound,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleDelete(
  config: ResolvedDimahS3Config,
  input: typeof deleteQuerySchema._output,
  request: Request,
): Promise<DeleteResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "delete",
  );

  await runHook(route.delete.guard, stored);

  await headObjectOrNotFound(route.client, bucket, key);

  await route.client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );

  await runLifecycleHook(route.delete.onDeleted, stored);

  return { success: true, bucket, key };
}

export const deleteObject = createS3Endpoint(
  S3_API_ROUTES.delete,
  { method: "DELETE", query: deleteQuerySchema },
  async (ctx) => {
    return handleDelete(ctx.context.config, ctx.query, ctx.context.request);
  },
);
