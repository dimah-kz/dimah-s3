import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteBatchBodySchema,
  isAPIError,
  S3_API_ROUTES,
  type DeleteBatchResponse,
} from "@dimah-s3/core";
import {
  headObjectOrNotFound,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function deleteOne(
  config: ResolvedDimahS3Config,
  routeName: string,
  key: string,
  request: Request,
): Promise<void> {
  const { route, bucket, stored } = await openStoredTarget(
    config,
    { route: routeName, key },
    request,
    "delete",
  );

  await runHook(route.delete.guard, stored);
  await headObjectOrNotFound(route.client, bucket, stored.key);
  await route.client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: stored.key }),
  );
  await runLifecycleHook(route.delete.onDeleted, stored, config);
}

export const deleteBatch = createS3Endpoint(
  S3_API_ROUTES.deleteBatch,
  { method: "POST", body: deleteBatchBodySchema },
  async (ctx): Promise<DeleteBatchResponse> => {
    const config = ctx.context.config;
    const request = ctx.context.request;
    const results: DeleteBatchResponse["results"] = [];

    for (const key of ctx.body.keys) {
      try {
        await deleteOne(config, ctx.body.route, key, request);
        results.push({ key, success: true });
      } catch (err) {
        results.push({
          key,
          success: false,
          error: isAPIError(err)
            ? { code: err.code ?? "INTERNAL_ERROR", message: err.message }
            : { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
      }
    }

    return { results };
  },
);
