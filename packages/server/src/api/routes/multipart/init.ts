import { multipartInitBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { initMultipart } from "@/operations/multipart/init";

export const multipartInit = createS3Endpoint(
  S3_API_ROUTES.multipartInit,
  { method: "POST", body: multipartInitBodySchema },
  async (ctx) => {
    const result = await initMultipart(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    });
    ctx.setStatus(201);
    return result;
  },
);
