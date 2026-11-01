import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { isAwsNotImplemented, isAwsPreconditionFailed } from "./aws-errors";

/** The object to delete, and the ETag it must still have. */
export type ConditionalDeleteInput = {
  bucket: string;
  key: string;
  /** ETag from the HeadObject that identified the object. */
  eTag?: string;
};

/**
 * DeleteObject that keeps a newer object at the same key. With an `eTag`,
 * the delete is conditional (`If-Match`): when the key now holds another
 * object (`412`), nothing is deleted and it returns `false`. A provider
 * without conditional DeleteObject (`501`) gets a plain delete. Any other
 * failure is thrown.
 */
export async function deleteObjectIfMatch(
  client: S3Client,
  input: ConditionalDeleteInput,
): Promise<boolean> {
  const target = { Bucket: input.bucket, Key: input.key };
  if (input.eTag === undefined) {
    await client.send(new DeleteObjectCommand(target));
    return true;
  }
  try {
    await client.send(
      new DeleteObjectCommand({ ...target, IfMatch: input.eTag }),
    );
  } catch (error) {
    if (isAwsPreconditionFailed(error)) return false;
    if (!isAwsNotImplemented(error)) throw error;
    await client.send(new DeleteObjectCommand(target));
  }
  return true;
}

/**
 * {@link deleteObjectIfMatch} after a failed check, ignoring every failure:
 * the caller is already returning an error, and an object left behind is
 * caught by purge or a bucket lifecycle rule.
 */
export async function deleteObjectBestEffort(
  client: S3Client,
  bucket: string,
  key: string,
  eTag?: string,
): Promise<void> {
  try {
    await deleteObjectIfMatch(client, { bucket, key, eTag });
  } catch {
    // Best-effort cleanup.
  }
}

/** Best-effort AbortMultipartUpload, when init fails after CreateMultipartUpload. */
export async function abortMultipartBestEffort(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
): Promise<void> {
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  } catch {
    // Best-effort cleanup.
  }
}
