import type { Part } from "@aws-sdk/client-s3";
import type {
  MultipartListPartsResponse,
  MultipartPartInfo,
} from "@dimah-s3/core";
import { runGuards } from "@/helpers/hooks";
import { listAllParts } from "@/helpers/list-parts";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import { openMultipart, type MultipartTicketBody } from "./open-multipart";
/**
 * Lists the uploaded parts (`POST /presign/multipart/parts`,
 * `s3.api.multipart.listParts`), so a client can resume an upload. It reads
 * every ListParts page.
 */
export function listMultipartParts(
  config: ResolvedConfig,
  body: MultipartTicketBody,
  options: S3ServerCallOptions = {},
): Promise<MultipartListPartsResponse> {
  return runOperation(config, "multipart.listParts", options, async (call) => {
    const { route, context } = await openMultipart(config, call, body.ticket);
    await runGuards(route.upload.multipart.guard, {
      ...context,
      action: "list",
    });
    const parts = await listAllParts(route.client, context);
    return { parts: parts.flatMap(toPartInfo) };
  });
}

/** A listed part in the protocol shape. Parts without a number are skipped. */
function toPartInfo(part: Part): MultipartPartInfo[] {
  if (part.PartNumber === undefined || part.PartNumber < 1) return [];
  return [
    {
      partNumber: part.PartNumber,
      size: part.Size ?? 0,
      eTag: part.ETag?.replaceAll('"', "") ?? "",
      ...(part.ChecksumSHA256 ? { checksum: part.ChecksumSHA256 } : {}),
    },
  ];
}
