import { multipartTicketBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { abortMultipart } from "@/operations/multipart/abort";

export const multipartAbort = createS3Endpoint(
  S3_API_ROUTES.multipartAbort,
  { method: "POST", body: multipartTicketBodySchema },
  (ctx) =>
    abortMultipart(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
