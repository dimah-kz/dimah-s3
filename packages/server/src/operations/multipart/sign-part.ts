import { s3Error, type MultipartPartResponse } from "@dimah-s3/core";
import type { multipartSignPartBodySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { runGuards } from "@/helpers/hooks";
import { assertPartNumber, partByteSize } from "@/helpers/part-layout";
import { presignUploadPart } from "@/helpers/presign";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import { openMultipart } from "./open-multipart";

/** Body of `POST /presign/multipart/part`, after validation. */
export type MultipartSignPartBody = z.output<
  typeof multipartSignPartBodySchema
>;

/**
 * Presigns one part (`POST /presign/multipart/part`,
 * `s3.api.multipart.signPart`).
 *
 * The part number must be inside the layout chosen at init
 * (`MULTIPART_PART_INVALID`), and the part size comes from that layout, so
 * this never calls ListParts. The URL signs that size. When the ticket
 * requires checksums, the part's SHA-256 is required (`CHECKSUM_REQUIRED`)
 * and signed. Otherwise a sent checksum is ignored: the upload was created
 * without part checksums, and S3 would reject the part.
 */
export function signMultipartPart(
  config: ResolvedConfig,
  body: MultipartSignPartBody,
  options: S3ServerCallOptions = {},
): Promise<MultipartPartResponse> {
  return runOperation(config, "multipart.signPart", options, async (call) => {
    const { route, ticket, context, layout } = await openMultipart(
      config,
      call,
      body.ticket,
    );
    const { partNumber } = body;
    assertPartNumber(layout, partNumber);
    if (ticket.checksum && !body.checksum) {
      throw s3Error("CHECKSUM_REQUIRED");
    }
    const size = partByteSize(layout, partNumber);
    await runGuards(route.upload.multipart.guard, {
      ...context,
      action: "part",
      partNumber,
      size,
    });

    const { expiresIn } = route.upload;
    const { url, headers } = await presignUploadPart(route.client, {
      bucket: context.bucket,
      key: context.key,
      uploadId: context.uploadId,
      partNumber,
      size,
      checksum: ticket.checksum ? body.checksum : undefined,
      expiresIn,
    });
    return { url, partNumber, size, expiresIn, headers };
  });
}
