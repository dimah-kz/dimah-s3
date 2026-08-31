import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteQuerySchema,
  S3_API_ROUTES,
  type DeleteResponse,
} from "@dimah-s3/core";
import {
  getResolvedRoute,
  headObjectOrNotFound,
  resolveStoredTarget,
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
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "delete");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, input.key);

  await runHook(route.delete?.guard, {
    request,
    route: route.name,
    key,
    bucket,
  });

  await headObjectOrNotFound(route.client, bucket, key);

  await route.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  await runLifecycleHook(route.delete?.onDeleted, {
    request,
    route: route.name,
    key,
    bucket,
  });

  return { success: true, bucket, key };
}

export const deleteObject = createS3Endpoint(
  S3_API_ROUTES.delete,
  { method: "DELETE", query: deleteQuerySchema },
  async (ctx) => {
    return handleDelete(ctx.context.config, ctx.query, ctx.context.request);
  },
);
