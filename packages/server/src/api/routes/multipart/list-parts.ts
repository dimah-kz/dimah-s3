import { ListPartsCommand } from "@aws-sdk/client-s3";
import {
  multipartListPartsQuerySchema,
  S3_API_ROUTES,
  type MultipartListPartsResponse,
} from "@dimah-s3/core";
import { runHook, runLifecycleHook } from "../../../internal-helpers";
import type { ResolvedDimahS3Config } from "../../../types";
import { resolveRequestTarget } from "../../../helpers/resolve-target";
import { assertFeatureEnabled } from "../../assert-feature-enabled";
import { createS3Endpoint } from "../../create-s3-endpoint";

async function handleListParts(
  config: ResolvedDimahS3Config,
  input: typeof multipartListPartsQuerySchema._output,
  request: Request,
): Promise<MultipartListPartsResponse> {
  const { key, bucket } = await resolveRequestTarget(
    config,
    config.multipart,
    {
      request,
      key: input.key,
      bucket: input.bucket,
    },
  );
  const uploadId = input.uploadId;

  await runHook(config.multipart?.listGuard, {
    request,
    key,
    bucket,
    uploadId,
  });

  const response = await config.client.send(
    new ListPartsCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );

  const parts = (response.Parts ?? []).map((p) => ({
    partNumber: p.PartNumber ?? 0,
    size: p.Size ?? 0,
    eTag: (p.ETag ?? "").replace(/"/g, ""),
  }));

  await runLifecycleHook(config.multipart?.onList, {
    request,
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
    assertFeatureEnabled(ctx.context.config, "multipart");
    return handleListParts(ctx.context.config, ctx.query, ctx.context.request);
  },
);
