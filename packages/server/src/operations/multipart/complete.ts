import {
  CompleteMultipartUploadCommand,
  type CompletedPart,
  type Part,
  type S3Client,
} from "@aws-sdk/client-s3";
import {
  isS3ErrorCode,
  s3Error,
  type MultipartCompleteResponse,
} from "@dimah-s3/core";
import { finalizeConfirmed } from "@/helpers/finalize-confirmed";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { runGuards } from "@/helpers/hooks";
import { sendOrObjectNotFound } from "@/helpers/is-aws-not-found";
import { listAllParts } from "@/helpers/list-parts";
import { partByteSize, type PartLayout } from "@/helpers/part-layout";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { MultipartUploadContext } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";
import { openMultipart, type MultipartTicketBody } from "./open-multipart";

/**
 * Completes a multipart upload (`POST /presign/multipart/complete`,
 * `s3.api.multipart.complete`).
 *
 * After `upload.multipart.guard` (`action: "complete"`), it reads every
 * ListParts page and checks the parts against the layout chosen at init
 * (see {@link completedParts}). CompleteMultipartUpload assembles parts
 * `1..partCount`, then HeadObject reads the object and
 * {@link finalizeConfirmed} runs the same checks and hooks as confirm.
 *
 * Like confirm, a retry is safe. When the upload no longer exists because
 * an earlier or concurrent call completed it (at ListParts or at
 * CompleteMultipartUpload), the stored object is finalized again, as long
 * as it carries this upload's marker.
 */
export function completeMultipart(
  config: ResolvedConfig,
  body: MultipartTicketBody,
  options: S3ServerCallOptions = {},
): Promise<MultipartCompleteResponse> {
  return runOperation(config, "multipart.complete", options, async (call) => {
    const { route, ticket, objectContext, context, layout } =
      await openMultipart(config, call, body.ticket);
    await runGuards(route.upload.multipart.guard, {
      ...context,
      action: "complete",
    });
    const { bucket, key, uploadId } = context;

    const listed = await listPartsOfOpenUpload(route.client, context);
    if (listed) {
      const parts = completedParts(listed, layout, ticket.checksum);
      try {
        await sendOrObjectNotFound(() =>
          route.client.send(
            new CompleteMultipartUploadCommand({
              Bucket: bucket,
              Key: key,
              UploadId: uploadId,
              MultipartUpload: { Parts: parts },
            }),
          ),
        );
      } catch (error) {
        // Another call completed (or aborted) the upload after our
        // ListParts. HeadObject and the marker check decide.
        if (!isS3ErrorCode(error, "OBJECT_NOT_FOUND")) throw error;
      }
    }

    const head = await headObjectOrNotFound(route.client, bucket, key);
    const confirmed = await finalizeConfirmed({
      route,
      context: objectContext,
      kind: "multipart",
      uploadToken: ticket.id,
      uploadId,
      file: ticket.file,
      acl: ticket.acl,
      head,
    });
    return { ...confirmed, uploadId };
  });
}

/** The uploaded parts, or `undefined` when the upload no longer exists. */
async function listPartsOfOpenUpload(
  client: S3Client,
  context: MultipartUploadContext,
): Promise<Part[] | undefined> {
  try {
    return await listAllParts(client, context);
  } catch (error) {
    if (isS3ErrorCode(error, "OBJECT_NOT_FOUND")) return undefined;
    throw error;
  }
}

/**
 * The CompleteMultipartUpload part list. Every part `1..partCount` must be
 * listed (`MULTIPART_PART_MISSING`) with exactly its layout size
 * (`UPLOAD_SIZE_MISMATCH`), so the parts add up to the declared size. When
 * the ticket requires checksums, every part must have a SHA-256
 * (`CHECKSUM_REQUIRED`). Parts past `partCount` are left out.
 */
function completedParts(
  listed: readonly Part[],
  layout: PartLayout,
  checksum: boolean,
): CompletedPart[] {
  const byNumber = new Map(listed.map((part) => [part.PartNumber, part]));
  const parts: CompletedPart[] = [];
  for (let partNumber = 1; partNumber <= layout.partCount; partNumber++) {
    const part = byNumber.get(partNumber);
    if (!part?.ETag) throw s3Error("MULTIPART_PART_MISSING", { partNumber });
    const expected = partByteSize(layout, partNumber);
    if (part.Size !== expected) {
      throw s3Error("UPLOAD_SIZE_MISMATCH", {
        expected,
        actual: part.Size ?? 0,
      });
    }
    if (checksum && !part.ChecksumSHA256) throw s3Error("CHECKSUM_REQUIRED");
    parts.push({
      PartNumber: partNumber,
      ETag: part.ETag,
      ChecksumSHA256: part.ChecksumSHA256,
    });
  }
  return parts;
}
