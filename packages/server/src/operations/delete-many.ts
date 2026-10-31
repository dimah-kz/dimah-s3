import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type {
  APIError,
  DeleteManyPayload,
  DeleteManyResponse,
  S3ErrorShape,
} from "@dimah-s3/core";
import { toAPIError } from "@/helpers/error-boundary";
import { createLocals, runGuards, runLifecycle } from "@/helpers/hooks";
import { openRoute } from "@/helpers/resolve-route";
import { assertStoredKey } from "@/helpers/resolve-target";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { DeleteGuardContext } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";

/**
 * Deletes many objects of one route (`POST /delete/batch`,
 * `s3.api.deleteMany`).
 *
 * The route guard runs once for the call. Each key is then checked against
 * the route namespace and `delete.guard`, and the keys that pass go to S3 in
 * one DeleteObjects request. `delete.onDeleted` runs for each deleted key.
 * A per-key failure (an invalid key, a guard, an S3 error or an `onDeleted`
 * throw) is reported in `failed` and does not fail the call. A route error,
 * or a DeleteObjects request that fails as a whole, fails the call. Like
 * single delete, a key that is already gone counts as deleted, and the S3
 * call ignores client disconnects.
 */
export function deleteManyObjects(
  config: ResolvedConfig,
  payload: DeleteManyPayload,
  options: S3ServerCallOptions = {},
): Promise<DeleteManyResponse> {
  return runOperation(config, "deleteMany", options, async (call) => {
    const { route, context: routeContext } = await openRoute(
      config,
      call,
      payload.route,
      "delete",
    );
    const deleted: string[] = [];
    const failed: DeleteManyResponse["failed"] = [];
    const fail = (key: string, error: unknown) => {
      const apiError = toAPIError(error, config, call.request);
      failed.push({ key, error: errorShape(apiError) });
    };

    const allowed = new Map<string, DeleteGuardContext>();
    for (const input of new Set(payload.keys)) {
      try {
        const key = assertStoredKey(input, route.keyPrefix);
        if (allowed.has(key)) continue;
        // Each key gets its own locals, so a guard's result reaches only
        // that key's onDeleted.
        const context = {
          ...routeContext,
          key,
          bucket: route.bucket,
          locals: createLocals(routeContext.locals),
        };
        await runGuards(route.delete.guard, context);
        allowed.set(key, context);
      } catch (error) {
        fail(input, error);
      }
    }
    if (allowed.size === 0) return { deleted, failed };

    const { Errors = [] } = await route.client.send(
      new DeleteObjectsCommand({
        Bucket: route.bucket,
        Delete: {
          Objects: [...allowed.keys()].map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    for (const { Key, Code = "UnknownError", Message } of Errors) {
      if (Key === undefined || !allowed.delete(Key)) continue;
      const detail = Message ? `${Code}: ${Message}` : Code;
      fail(Key, new Error(`DeleteObjects failed for "${Key}": ${detail}`));
    }

    for (const [key, context] of allowed) {
      try {
        await runLifecycle(route.delete.onDeleted, context);
        deleted.push(key);
      } catch (error) {
        fail(key, error);
      }
    }
    return { deleted, failed };
  });
}

/** The wire body of an error, as an error response would carry it. */
function errorShape(error: APIError): S3ErrorShape {
  const { code, message, params } = error;
  // Plugin guards may throw codes outside the catalog; the shape is the same.
  return { code, message, ...(params ? { params } : {}) } as S3ErrorShape;
}
