import {
  ListPartsCommand,
  type ListPartsCommandOutput,
  type Part,
  type S3Client,
} from "@aws-sdk/client-s3";
import { sendOrObjectNotFound } from "./is-aws-not-found";

/** Parts per ListParts page, the most S3 returns. */
const LIST_PARTS_PAGE_SIZE = 1000;

/**
 * Every uploaded part of a multipart upload, reading ListParts page by page
 * until S3 reports no more. A missing upload fails with `OBJECT_NOT_FOUND`.
 */
export async function listAllParts(
  client: S3Client,
  input: { bucket: string; key: string; uploadId: string },
): Promise<Part[]> {
  const parts: Part[] = [];
  let partNumberMarker: string | undefined;
  let isTruncated = true;

  while (isTruncated) {
    const response: ListPartsCommandOutput = await sendOrObjectNotFound(() =>
      client.send(
        new ListPartsCommand({
          Bucket: input.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MaxParts: LIST_PARTS_PAGE_SIZE,
          PartNumberMarker: partNumberMarker,
        }),
      ),
    );
    parts.push(...(response.Parts ?? []));
    isTruncated = response.IsTruncated === true;
    partNumberMarker = response.NextPartNumberMarker;
    if (isTruncated && partNumberMarker === undefined) {
      throw new Error(
        `ListParts for "${input.key}" is truncated but has no NextPartNumberMarker.`,
      );
    }
  }

  return parts;
}
