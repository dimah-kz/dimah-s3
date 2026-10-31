import { downloadQuerySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { presignDownload } from "@/operations/download";

export const download = createS3Endpoint(
  S3_API_ROUTES.download,
  { method: "GET", query: downloadQuerySchema },
  (ctx) =>
    presignDownload(resolvedConfig(ctx.context), ctx.query, {
      request: ctx.context.request,
    }),
);
