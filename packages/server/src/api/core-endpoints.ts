import { s3Error, S3_API_ROUTES } from "@dimah-s3/core";
import {
  ticketBodySchema,
  deleteManyBodySchema,
  deleteQuerySchema,
  downloadQuerySchema,
  fileQuerySchema,
  multipartInitBodySchema,
  multipartSignPartBodySchema,
  uploadBodySchema,
} from "@dimah-s3/core/schema";
import type { Endpoint } from "better-call";
import { confirmUpload } from "@/operations/confirm";
import { deleteStoredObject } from "@/operations/delete";
import { deleteManyObjects } from "@/operations/delete-many";
import { presignDownload } from "@/operations/download";
import { serveFile, withFileHeaders } from "@/operations/file";
import { abortMultipart } from "@/operations/multipart/abort";
import { completeMultipart } from "@/operations/multipart/complete";
import { initMultipart } from "@/operations/multipart/init";
import { listMultipartParts } from "@/operations/multipart/list-parts";
import { signMultipartPart } from "@/operations/multipart/sign-part";
import { getRouteCatalog } from "@/operations/catalog";
import { presignUpload } from "@/operations/upload";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";
import type { S3EndpointContext } from "./context";
import { createCoreEndpoint } from "./create-s3-endpoint";
import { resolvedConfig } from "./router-context";

/*
 * The core HTTP endpoints, mounted under `basePath` beside the plugin
 * endpoints. Each one only reads its input and calls the operation that
 * `s3.api` runs too; the operation runs the guards and the hooks.
 */

/** The resolved config and the call options of an HTTP request. */
function call(context: S3EndpointContext): {
  config: ResolvedConfig;
  options: S3ServerCallOptions;
} {
  return {
    config: resolvedConfig(context),
    options: { request: context.request },
  };
}

/** One endpoint per `S3_API_ROUTES` entry, under the same name. */
export const coreEndpoints = {
  upload: createCoreEndpoint(
    S3_API_ROUTES.upload,
    { method: "POST", body: uploadBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return presignUpload(config, ctx.body, options);
    },
  ),

  confirm: createCoreEndpoint(
    S3_API_ROUTES.confirm,
    { method: "POST", body: ticketBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return confirmUpload(config, ctx.body, options);
    },
  ),

  download: createCoreEndpoint(
    S3_API_ROUTES.download,
    { method: "GET", query: downloadQuerySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return presignDownload(config, ctx.query, options);
    },
  ),

  catalog: createCoreEndpoint(
    S3_API_ROUTES.catalog,
    { method: "GET" },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return getRouteCatalog(config, options);
    },
  ),

  file: createCoreEndpoint(
    S3_API_ROUTES.file,
    {
      method: "GET",
      query: fileQuerySchema,
      // A bad query fails before serveFile runs; it gets the /file headers too.
      onValidationError: ({ message }) => {
        throw withFileHeaders(s3Error("VALIDATION_ERROR", { issue: message }));
      },
    },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return serveFile(config, ctx.query, options);
    },
  ),

  delete: createCoreEndpoint(
    S3_API_ROUTES.delete,
    { method: "DELETE", query: deleteQuerySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return deleteStoredObject(config, ctx.query, options);
    },
  ),

  deleteMany: createCoreEndpoint(
    S3_API_ROUTES.deleteMany,
    { method: "POST", body: deleteManyBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return deleteManyObjects(config, ctx.body, options);
    },
  ),

  multipartInit: createCoreEndpoint(
    S3_API_ROUTES.multipartInit,
    { method: "POST", body: multipartInitBodySchema },
    async (ctx) => {
      const { config, options } = call(ctx.context);
      const result = await initMultipart(config, ctx.body, options);
      ctx.setStatus(201);
      return result;
    },
  ),

  multipartSignPart: createCoreEndpoint(
    S3_API_ROUTES.multipartSignPart,
    { method: "POST", body: multipartSignPartBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return signMultipartPart(config, ctx.body, options);
    },
  ),

  multipartListParts: createCoreEndpoint(
    S3_API_ROUTES.multipartListParts,
    { method: "POST", body: ticketBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return listMultipartParts(config, ctx.body, options);
    },
  ),

  multipartComplete: createCoreEndpoint(
    S3_API_ROUTES.multipartComplete,
    { method: "POST", body: ticketBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return completeMultipart(config, ctx.body, options);
    },
  ),

  multipartAbort: createCoreEndpoint(
    S3_API_ROUTES.multipartAbort,
    { method: "POST", body: ticketBodySchema },
    (ctx) => {
      const { config, options } = call(ctx.context);
      return abortMultipart(config, ctx.body, options);
    },
  ),
} satisfies Record<keyof typeof S3_API_ROUTES, Endpoint>;
