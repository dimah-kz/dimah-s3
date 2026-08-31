import {
  multipartListPartsQuerySchema,
  S3_API_ROUTES,
  type MultipartListPartsResponse,
} from "@dimah-s3/core";
import {
  getResolvedRoute,
  listAllParts,
  resolveStoredTarget,
  runHook,
  runLifecycleHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { assertFeatureEnabled } from "@/api/assert-feature-enabled";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleListParts(
  config: ResolvedDimahS3Config,
  input: typeof multipartListPartsQuerySchema._output,
  request: Request,
): Promise<MultipartListPartsResponse> {
  const route = getResolvedRoute(config, input.route);
  assertFeatureEnabled(route, "multipart");
  await runHook(route.guard, { request, route: route.name });

  const { key, bucket } = resolveStoredTarget(route, "multipart", input.key);
  const uploadId = input.uploadId;

  await runHook(route.multipart?.listGuard, {
    request,
    route: route.name,
    key,
    bucket,
    uploadId,
  });

  const listed = await listAllParts(route.client, { bucket, key, uploadId });

  const parts = listed.map((p) => ({
    partNumber: p.PartNumber ?? 0,
    size: p.Size ?? 0,
    eTag: (p.ETag ?? "").replace(/"/g, ""),
  }));

  await runLifecycleHook(route.multipart?.onList, {
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
