import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

/** Best-effort DeleteObject after a failed constraint check. */
export async function deleteObjectBestEffort(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort cleanup.
  }
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
