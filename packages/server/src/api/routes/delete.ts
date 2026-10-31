import { deleteQuerySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { deleteStoredObject } from "@/operations/delete";

export const deleteObject = createS3Endpoint(
  S3_API_ROUTES.delete,
  { method: "DELETE", query: deleteQuerySchema },
  (ctx) =>
    deleteStoredObject(resolvedConfig(ctx.context), ctx.query, {
      request: ctx.context.request,
    }),
);
