import { S3_API_ROUTES, uploadBodySchema } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { presignUpload } from "@/operations/upload";

export const upload = createS3Endpoint(
  S3_API_ROUTES.upload,
  { method: "POST", body: uploadBodySchema },
  (ctx) =>
    presignUpload(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
