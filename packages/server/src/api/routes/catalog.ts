import { S3_API_ROUTES } from "@dimah-s3/core";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { resolvedConfig } from "@/api/router-context";
import { getRouteCatalog } from "@/operations/s3-api";

export const catalog = createS3Endpoint(
  S3_API_ROUTES.catalog,
  { method: "GET" },
  (ctx) =>
    getRouteCatalog(resolvedConfig(ctx.context), {
      request: ctx.context.request,
    }),
);
