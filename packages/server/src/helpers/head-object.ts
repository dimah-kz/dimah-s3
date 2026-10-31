import {
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { sendOrObjectNotFound } from "./is-aws-not-found";

/**
 * HeadObject of a stored object. A missing object fails with
 * `OBJECT_NOT_FOUND`. `abortSignal` cancels the call, for example when the
 * client disconnects.
 */
export function headObjectOrNotFound(
  client: S3Client,
  bucket: string,
  key: string,
  options: { abortSignal?: AbortSignal } = {},
): Promise<HeadObjectCommandOutput> {
  return sendOrObjectNotFound(() =>
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), options),
  );
}
