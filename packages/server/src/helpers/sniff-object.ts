import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import {
  effectiveContentType,
  isSniffableType,
  matchesMagicBytes,
  s3Error,
  SNIFF_BYTE_LENGTH,
  sniffContentType,
} from "@dimah-s3/core";
import {
  isAwsRangeNotSatisfiable,
  sendOrObjectNotFound,
} from "@/helpers/aws-errors";

export type ObjectContentInput = {
  bucket: string;
  key: string;
  /** Content type as HeadObject reports it. */
  type?: string;
  /** Stored file name. Gives the type of an untyped object. */
  name?: string;
};

/**
 * `verifyContent`: reads the first {@link SNIFF_BYTE_LENGTH} bytes with a
 * ranged GetObject and checks them against the type's magic bytes. A
 * mismatch fails with `FILE_CONTENT_MISMATCH`; the caller deletes the object.
 *
 * An untyped object (no type, or `application/octet-stream`) is checked
 * against the type downloads infer from its name, since `/file` and the
 * presigned GET serve it inline as that type. Types without a known
 * signature, such as `text/plain`, and untyped objects whose name gives no
 * type cannot be verified this way and pass without a read.
 */
export async function assertObjectContent(
  client: S3Client,
  input: ObjectContentInput,
): Promise<void> {
  // The type downloads serve the object as, so the two cannot drift.
  const type = effectiveContentType(input.type, input.name);
  if (type === undefined || !isSniffableType(type)) return;

  const bytes = await readObjectStart(client, input);
  if (matchesMagicBytes(bytes, type)) return;
  throw s3Error("FILE_CONTENT_MISMATCH", {
    type,
    detected: sniffContentType(bytes) ?? "unknown",
  });
}

async function readObjectStart(
  client: S3Client,
  input: ObjectContentInput,
): Promise<Uint8Array> {
  let response: GetObjectCommandOutput;
  try {
    response = await sendOrObjectNotFound(() =>
      client.send(
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Range: `bytes=0-${SNIFF_BYTE_LENGTH - 1}`,
        }),
      ),
    );
  } catch (error) {
    // S3 answers a range on an empty object with 416.
    if (isAwsRangeNotSatisfiable(error)) return new Uint8Array();
    throw error;
  }
  if (!response.Body) return new Uint8Array();

  // A provider that ignores Range sends the whole object; stop reading early.
  const reader = response.Body.transformToWebStream().getReader();
  const bytes = new Uint8Array(SNIFF_BYTE_LENGTH);
  let length = 0;
  try {
    while (length < SNIFF_BYTE_LENGTH) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, SNIFF_BYTE_LENGTH - length);
      bytes.set(chunk, length);
      length += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return bytes.subarray(0, length);
}
