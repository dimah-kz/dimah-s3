import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import {
  isAPIError,
  resolveStoredFileName,
  s3Error,
  type ConfirmedObjectResponse,
  type S3ObjectAcl,
} from "@dimah-s3/core";
import { deleteObjectBestEffort } from "@/helpers/best-effort";
import { assertFileConstraints } from "@/helpers/constraints";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { readObjectMetadata } from "@/helpers/object-meta";
import { assertStoredKey } from "@/helpers/resolve-target";
import { assertObjectContent } from "@/helpers/sniff-object";
import type {
  ObjectContext,
  UploadFile,
  UploadKind,
  UploadOnConfirmedContext,
  VerifiedObject,
} from "@/types/hook-contexts";
import type { OpenedRoute } from "@/types/resolved";

export type FinalizeConfirmedInput = {
  route: OpenedRoute<"upload">;
  /** Context of the call, with the uploaded key and bucket. */
  context: ObjectContext;
  kind: UploadKind;
  /** Upload token of this upload. The object must carry it as its marker. */
  uploadToken: string;
  /** Multipart only. */
  uploadId?: string;
  /** File declared at presign, multipart init or `s3.put`. */
  file: UploadFile;
  /** Effective ACL written at presign, multipart init or `s3.put`. */
  acl: S3ObjectAcl;
  /** HeadObject of the uploaded key. */
  head: HeadObjectCommandOutput;
};

/**
 * Finishes an upload once its object is in S3: confirm, multipart complete
 * and `s3.put`.
 *
 * 1. The object must carry this upload's marker. Otherwise the key holds
 *    another upload's object, so the call fails with `OBJECT_NOT_FOUND` and
 *    nothing is deleted.
 * 2. The HeadObject size must equal the declared size
 *    (`UPLOAD_SIZE_MISMATCH`), and the stored name, type and size must pass
 *    the route limits.
 * 3. With `verifyContent`, the first bytes must match the type (for an
 *    untyped object, the type its name gives on download).
 * 4. `upload.confirmGuard` runs with the verified `object`, except for
 *    `s3.put`.
 * 5. `upload.onConfirmed` runs: plugins first, then the user hook.
 *
 * A rejection (a `4xx` `APIError`) in steps 2 to 4, or from a plugin
 * `onConfirmed`, deletes the object and returns the error. That delete is
 * conditional on the HeadObject ETag where the provider supports `If-Match`,
 * so a newer upload at the same key is kept. Any other failure, such as an
 * S3 network error or a hook whose database is down, keeps the object, so
 * the confirm can be retried. A throw from the user `onConfirmed` keeps the
 * object and returns `500 INTERNAL_ERROR`, even for an `APIError`, so a
 * retried confirm replays the hooks with the same `uploadToken`. After every
 * hook succeeds, `upload.object().previousKey` is deleted.
 */
export async function finalizeConfirmed(
  input: FinalizeConfirmedInput,
): Promise<ConfirmedObjectResponse> {
  const { route, context, head } = input;
  const { bucket, key } = context;
  const stored = readObjectMetadata(head.Metadata);
  if (stored.uploadToken !== input.uploadToken) {
    throw s3Error("OBJECT_NOT_FOUND");
  }

  // Conditional on this HEAD, so a newer upload at the same key is kept.
  const deleteObject = () =>
    deleteObjectBestEffort(route.client, bucket, key, head.ETag);
  let object: VerifiedObject;
  try {
    object = verifiedObject(head, key, stored.metadata);
    await verifyUpload(input, object);
  } catch (error) {
    if (isRejection(error)) await deleteObject();
    throw error;
  }

  const previousKey = previousKeyToDelete(
    stored.previousKey,
    key,
    route.keyPrefix,
  );
  const confirmed: UploadOnConfirmedContext = {
    ...context,
    kind: input.kind,
    uploadToken: input.uploadToken,
    uploadId: input.uploadId,
    file: input.file,
    acl: input.acl,
    object,
    ...(previousKey !== undefined ? { previousKey } : {}),
  };
  const hooks = route.upload.onConfirmed;
  await runLifecycle(
    hooks.filter((entry) => entry.plugin !== undefined),
    confirmed,
    {
      // A transient plugin failure keeps the object for the retry.
      onPluginError: async (error) => {
        if (isRejection(error)) await deleteObject();
      },
    },
  );
  try {
    await runLifecycle(
      hooks.filter((entry) => entry.plugin === undefined),
      confirmed,
    );
  } catch (error) {
    throw userHookFailure(error);
  }

  if (previousKey !== undefined) {
    await deleteObjectBestEffort(route.client, bucket, previousKey);
  }

  return { key, bucket, ...object, acl: input.acl };
}

/** The object as HeadObject reports it, with decoded user metadata. */
function verifiedObject(
  head: HeadObjectCommandOutput,
  key: string,
  metadata: Record<string, string>,
): VerifiedObject {
  if (typeof head.ContentLength !== "number") {
    throw new TypeError(`HeadObject returned no ContentLength for "${key}".`);
  }
  return {
    name: resolveStoredFileName(head.ContentDisposition, key),
    size: head.ContentLength,
    type: head.ContentType,
    eTag: head.ETag?.replaceAll('"', ""),
    versionId: head.VersionId,
    lastModified: head.LastModified?.toISOString(),
    metadata,
  };
}

async function verifyUpload(
  input: FinalizeConfirmedInput,
  object: VerifiedObject,
): Promise<void> {
  const { route, context, kind, file, acl } = input;
  if (object.size !== file.size) {
    throw s3Error("UPLOAD_SIZE_MISMATCH", {
      expected: file.size,
      actual: object.size,
    });
  }
  assertFileConstraints(route.upload, object);
  if (route.upload.verifyContent) {
    await assertObjectContent(route.client, {
      bucket: context.bucket,
      key: context.key,
      type: object.type,
      name: object.name,
    });
  }
  if (kind !== "server") {
    await runGuards(route.upload.confirmGuard, {
      ...context,
      kind,
      uploadToken: input.uploadToken,
      uploadId: input.uploadId,
      file,
      acl,
      object,
    });
  }
}

/** A `4xx` `APIError`: the upload was checked and refused. */
function isRejection(error: unknown): boolean {
  return isAPIError(error) && error.statusCode < 500;
}

/**
 * What a user `onConfirmed` throw becomes. The object is kept, so the client
 * gets `500 INTERNAL_ERROR` and can retry, even when the hook threw an
 * `APIError`. The error boundary logs it and passes it to `onError`.
 */
function userHookFailure(error: unknown): unknown {
  if (!isAPIError(error)) return error;
  return new Error(`upload.onConfirmed failed: ${error.message}`, {
    cause: error,
  });
}

/** The stored `previousKey`, when it is another key inside the route namespace. */
function previousKeyToDelete(
  previousKey: string | undefined,
  key: string,
  keyPrefix: string | false,
): string | undefined {
  if (previousKey === undefined) return undefined;
  try {
    const safe = assertStoredKey(previousKey, keyPrefix);
    return safe === key ? undefined : safe;
  } catch {
    return undefined;
  }
}
