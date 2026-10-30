import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  fileQuerySchema,
  resolveStoredFileName,
  S3_API_ROUTES,
} from "@dimah-s3/core";
import type * as z from "zod";
import { errors } from "@/errors";
import {
  applyInlineTypes,
  headObjectOrNotFound,
  openStoredTarget,
  runHook,
  sendOrObjectNotFound,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

async function handleFile(
  config: ResolvedDimahS3Config,
  input: z.output<typeof fileQuerySchema>,
  request: Request,
): Promise<Response> {
  const { route, key, bucket, stored } = await openStoredTarget(
    config,
    input,
    request,
    "download",
  );

  const resolved = await route.download.resolve?.({
    ...stored,
    fileName: input.fileName,
    disposition: input.disposition ?? route.download.disposition,
  });
  const fileName = resolved?.fileName ?? input.fileName;
  const disposition =
    resolved?.disposition ??
    input.disposition ??
    route.download.disposition ??
    "attachment";

  await runHook(route.download.guard, {
    ...stored,
    fileName,
    disposition,
  });

  const head = await headObjectOrNotFound(route.client, bucket, key);
  const signed = applyInlineTypes(route.download.inlineTypes, {
    key,
    fileName,
    disposition,
    contentType: head.ContentType,
  });
  const contentDisposition = fileName
    ? buildContentDisposition(fileName, signed.disposition)
    : signed.disposition;

  const result = await sendOrObjectNotFound(() =>
    route.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition,
      }),
    ),
  );

  const body = result.Body;
  if (!body) throw errors.objectNotFound();

  const stream =
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
      ? body.transformToWebStream()
      : (body as ReadableStream<Uint8Array>);

  const headers = new Headers();
  headers.set(
    "Content-Type",
    signed.contentType ?? result.ContentType ?? "application/octet-stream",
  );
  headers.set("Content-Disposition", contentDisposition);
  // Same-origin bytes: the browser must not guess a type that runs as a page.
  headers.set("X-Content-Type-Options", "nosniff");
  if (typeof result.ContentLength === "number") {
    headers.set("Content-Length", String(result.ContentLength));
  }

  return new Response(stream, { headers });
}

export const file = createS3Endpoint(
  S3_API_ROUTES.file,
  { method: "GET", query: fileQuerySchema },
  async (ctx) => {
    return handleFile(ctx.context.config, ctx.query, ctx.context.request);
  },
);

export { resolveStoredFileName };
