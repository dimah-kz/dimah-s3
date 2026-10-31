import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

/**
 * Best-effort DeleteObject after a failed constraint check.
 *
 * With an `eTag`, the delete is conditional (`If-Match`): when the key now
 * holds another object (`412`), that object is kept. A provider without
 * conditional DeleteObject (`501`) gets a plain delete.
 */
export async function deleteObjectBestEffort(
  client: S3Client,
  bucket: string,
  key: string,
  eTag?: string,
): Promise<void> {
  const input = { Bucket: bucket, Key: key };
  try {
    if (eTag === undefined) {
      await client.send(new DeleteObjectCommand(input));
      return;
    }
    try {
      await client.send(new DeleteObjectCommand({ ...input, IfMatch: eTag }));
    } catch (error) {
      if (isPreconditionFailed(error)) return;
      if (!isNotImplemented(error)) throw error;
      await client.send(new DeleteObjectCommand(input));
    }
  } catch {
    // Best-effort cleanup.
  }
}

type AwsError = { name?: string; $metadata?: { httpStatusCode?: number } };

function isPreconditionFailed(error: unknown): boolean {
  const e = error as AwsError | undefined;
  return (
    e?.name === "PreconditionFailed" || e?.$metadata?.httpStatusCode === 412
  );
}

function isNotImplemented(error: unknown): boolean {
  const e = error as AwsError | undefined;
  return e?.name === "NotImplemented" || e?.$metadata?.httpStatusCode === 501;
}

/** Best-effort AbortMultipartUpload before assembly or after a failed complete. */
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
