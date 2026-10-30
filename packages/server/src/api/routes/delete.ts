import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  deleteQuerySchema,
  S3_API_ROUTES,
  type DeleteResponse,
} from "@dimah-s3/core";
import {
  objectExists,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

/**
 * Idempotent delete. An object that never landed, or is already gone, still
 * runs the guards and `onDeleted` (with `existed: false`), so a `db()` row
 * for a pending or expired upload is cleaned up.
 */
export async function deleteStoredObject(
  config: ResolvedDimahS3Config,
  input: { route: string; key: string },
  request: Request,
): Promise<DeleteResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "delete",
  );

  await runHook(route.delete.guard, stored);

  const existed = await objectExists(route.client, bucket, key);
  if (existed) {
    await route.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  await runLifecycleHook(
    route.delete.onDeleted,
    { ...stored, existed },
    config,
  );

  return { success: true, bucket, key, existed };
}

export const deleteObject = createS3Endpoint(
  S3_API_ROUTES.delete,
  { method: "DELETE", query: deleteQuerySchema },
  async (ctx) => {
    return deleteStoredObject(
      ctx.context.config,
      ctx.query,
      ctx.context.request,
    );
  },
);
