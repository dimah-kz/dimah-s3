import {
  ListPartsCommand,
  type ListPartsCommandOutput,
  type Part,
  type S3Client,
} from "@aws-sdk/client-s3";
import { sendOrObjectNotFound } from "./is-aws-not-found";

/** Page through ListParts until S3 reports no more parts. */
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
          ...(partNumberMarker ? { PartNumberMarker: partNumberMarker } : {}),
        }),
      ),
    );
    parts.push(...(response.Parts ?? []));
    isTruncated = response.IsTruncated === true;
    partNumberMarker = isTruncated ? response.NextPartNumberMarker : undefined;
  }

  return parts;
}

/** Sum `Size` on listed parts. Pass `excludePartNumber` when replacing a part. */
export function listedPartsByteSize(
  parts: readonly { PartNumber?: number; Size?: number }[],
  excludePartNumber?: number,
): number {
  let total = 0;
  for (const part of parts) {
    if (
      excludePartNumber !== undefined &&
      part.PartNumber === excludePartNumber
    ) {
      continue;
    }
    total += part.Size ?? 0;
  }
  return total;
}
