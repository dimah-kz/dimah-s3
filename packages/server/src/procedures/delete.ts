import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { DeleteResponse } from "@dimah-s3/core";
import { errors } from "../errors";
import { isAwsNotFound } from "../helpers";
import { runHook, runLifecycleHook } from "../internal-helpers";
import type { DimahS3Config } from "../types";

export type DeleteInput = {
  key: string;
  bucket?: string;
};

export async function deleteObject(
  config: DimahS3Config,
  input: DeleteInput,
  request: Request,
): Promise<DeleteResponse> {
  const key = input.key?.trim();
  if (!key) {
    throw errors.keyRequired();
  }

  const bucket = input.bucket?.trim() || config.defaultBucket;

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
