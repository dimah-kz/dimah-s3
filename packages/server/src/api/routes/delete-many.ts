import { deleteManyBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { deleteManyObjects } from "@/operations/delete-many";

export const deleteMany = createS3Endpoint(
  S3_API_ROUTES.deleteMany,
  { method: "POST", body: deleteManyBodySchema },
  (ctx) =>
    deleteManyObjects(resolvedConfig(ctx.context), ctx.body, {
      request: ctx.context.request,
    }),
);
