import { confirmBodySchema, S3_API_ROUTES } from "@dimah-s3/core";
import type * as z from "zod";
import {
  finalizeConfirmedObject,
  headObjectOrNotFound,
  openStoredTarget,
  runHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleConfirm(
  config: ResolvedDimahS3Config,
  input: z.output<typeof confirmBodySchema>,
  request: Request,
) {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "upload",
  );

  await runHook(route.upload.confirmGuard, {
    ...stored,
    replace: route.upload.replace,
  });

  const head = await headObjectOrNotFound(route.client, bucket, key);
  return finalizeConfirmedObject(route.client, bucket, key, {
    config,
    route,
    stored,
    head,
    acl: route.upload.acl,
  });
}

export const confirm = createS3Endpoint(
  S3_API_ROUTES.uploadConfirm,
  { method: "POST", body: confirmBodySchema },
  async (ctx) => {
    return handleConfirm(ctx.context.config, ctx.body, ctx.context.request);
  },
);
