import { multipartSignPartBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { signMultipartPart } from "@/operations/multipart/sign-part";

export const multipartSignPart = createS3Endpoint(
  S3_API_ROUTES.multipartSignPart,
  { method: "POST", body: multipartSignPartBodySchema },
  (ctx) =>
    signMultipartPart(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
