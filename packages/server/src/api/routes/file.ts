import { fileQuerySchema, s3Error, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { serveFile, withFileHeaders } from "@/operations/file";

export const file = createS3Endpoint(
  S3_API_ROUTES.file,
  {
    method: "GET",
    query: fileQuerySchema,
    // A bad query fails before serveFile runs; it gets the /file headers too.
    onValidationError: ({ message }) => {
      throw withFileHeaders(s3Error("VALIDATION_ERROR", { issue: message }));
    },
  },
  (ctx) =>
    serveFile(resolvedConfig(ctx.context), ctx.query, {
      request: ctx.context.request,
    }),
);
