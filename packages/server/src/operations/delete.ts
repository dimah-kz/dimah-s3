import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { DeletePayload, DeleteResponse } from "@dimah-s3/core";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { openObject } from "@/helpers/resolve-route";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/**
 * Deletes one object (`DELETE /delete`, `s3.api.delete`).
 *
 * After the route guard and `delete.guard`, DeleteObject runs, then
 * `delete.onDeleted`. Delete is idempotent: a key that never landed or is
 * already gone succeeds and still runs `onDeleted`, so a pending or expired
 * upload's bookkeeping is cleaned up. The S3 call ignores client
 * disconnects, so `onDeleted` sees every delete that happened.
 */
export function deleteStoredObject(
  config: ResolvedConfig,
  payload: DeletePayload,
  options: S3ServerCallOptions = {},
): Promise<DeleteResponse> {
  return runOperation(config, "delete", options, async (call) => {
    const { route, context } = await openObject(
      config,
      call,
      payload,
      "delete",
    );
    await runGuards(route.delete.guard, context);

    const { bucket, key } = context;
    await route.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
    await runLifecycle(route.delete.onDeleted, context);
    return { key, bucket };
  });
}
