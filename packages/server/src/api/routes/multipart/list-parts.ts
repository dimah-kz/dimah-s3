import {
  multipartListPartsQuerySchema,
  S3_API_ROUTES,
  type MultipartListPartsResponse,
} from "@dimah-s3/core";
import {
  listAllParts,
  openStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleListParts(
  config: ResolvedDimahS3Config,
  input: typeof multipartListPartsQuerySchema._output,
  request: Request,
): Promise<MultipartListPartsResponse> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;

  await runHook(route.upload.multipart.guard, {
    ...stored,
    uploadId,
    action: "list",
  });

  const listed = await listAllParts(route.client, { bucket, key, uploadId });

  const parts = listed.flatMap((p) => {
    if (p.PartNumber == null || p.PartNumber < 1) return [];
    return [
      {
        partNumber: p.PartNumber,
        size: p.Size ?? 0,
        eTag: (p.ETag ?? "").replace(/"/g, ""),
      },
    ];
  });

  await runLifecycleHook(
    route.upload.multipart.onList,
    {
      ...stored,
      uploadId,
      parts,
    },
    config,
  );

  return { parts };
}

export const multipartListParts = createS3Endpoint(
  S3_API_ROUTES.multipartListParts,
  { method: "GET", query: multipartListPartsQuerySchema },
  async (ctx) => {
    return handleListParts(ctx.context.config, ctx.query, ctx.context.request);
  },
);
