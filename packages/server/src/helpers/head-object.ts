import {
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { sendOrObjectNotFound } from "./is-aws-not-found";

/** HeadObject, mapping AWS not-found to `OBJECT_NOT_FOUND`. */
export async function headObjectOrNotFound(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput> {
  return sendOrObjectNotFound(() =>
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
  );
}

/**
 * HeadObject after CompleteMultipartUpload. Some providers briefly omit
 * `ContentLength`; retry a few times with exponential backoff.
 */
export async function headObjectAfterMultipartComplete(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput> {
  let head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  for (let attempt = 0; attempt < 4 && !head.ContentLength; attempt++) {
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
  return head;
}
