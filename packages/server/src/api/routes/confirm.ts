import { confirmBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { confirmUpload } from "@/operations/confirm";

export const confirm = createS3Endpoint(
  S3_API_ROUTES.confirm,
  { method: "POST", body: confirmBodySchema },
  (ctx) =>
    confirmUpload(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
