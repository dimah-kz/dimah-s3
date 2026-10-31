import { multipartTicketBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { listMultipartParts } from "@/operations/multipart/list-parts";

export const multipartListParts = createS3Endpoint(
  S3_API_ROUTES.multipartListParts,
  { method: "POST", body: multipartTicketBodySchema },
  (ctx) =>
    listMultipartParts(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
