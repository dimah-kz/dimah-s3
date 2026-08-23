import {
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { errors } from "../errors";
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
  const send = () =>
    sendOrObjectNotFound(() =>
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    );

  let head = await send();
  for (let attempt = 0; attempt < 4 && !head.ContentLength; attempt++) {
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    head = await send();
  }
  return head;
}

/** Verified size from HeadObject — never invent `0` when S3 omits it. */
export function requireContentLength(head: HeadObjectCommandOutput): number {
  if (typeof head.ContentLength !== "number") {
    throw errors.internalError();
  }
  return head.ContentLength;
}
