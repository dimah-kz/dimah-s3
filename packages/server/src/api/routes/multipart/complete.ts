import { multipartTicketBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { completeMultipart } from "@/operations/multipart/complete";

export const multipartComplete = createS3Endpoint(
  S3_API_ROUTES.multipartComplete,
  { method: "POST", body: multipartTicketBodySchema },
  (ctx) =>
    completeMultipart(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
