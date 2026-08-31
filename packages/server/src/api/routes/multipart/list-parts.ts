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
  const { route, key, bucket } = await openStoredTarget(
    config,
    input,
    request,
    "multipart",
  );
  const uploadId = input.uploadId;

  await runHook(route.upload.multipart.sessionGuard, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
    action: "list",
  });

  const listed = await listAllParts(route.client, { bucket, key, uploadId });

  const parts = listed.map((p) => ({
    partNumber: p.PartNumber ?? 0,
    size: p.Size ?? 0,
    eTag: (p.ETag ?? "").replace(/"/g, ""),
  }));

  await runLifecycleHook(route.upload.multipart.onList, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
    parts,
  });

  return { parts };
}

export const multipartListParts = createS3Endpoint(
  S3_API_ROUTES.multipartListParts,
  { method: "GET", query: multipartListPartsQuerySchema },
  async (ctx) => {
    return handleListParts(ctx.context.config, ctx.query, ctx.context.request);
  },
);
