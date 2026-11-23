import { s3Error } from "@dimah-s3/core";
import {
  ticketBodySchema,
  deleteManyBodySchema,
  deleteQuerySchema,
  downloadQuerySchema,
  multipartInitBodySchema,
  multipartSignPartBodySchema,
  uploadBodySchema,
} from "@dimah-s3/core/schema";
import type * as z from "zod";
import { getRouteCatalog } from "@/operations/catalog";
import { confirmUpload } from "@/operations/confirm";
import { deleteStoredObject } from "@/operations/delete";
import { deleteManyObjects } from "@/operations/delete-many";
import { presignDownload } from "@/operations/download";
import { abortMultipart } from "@/operations/multipart/abort";
import { completeMultipart } from "@/operations/multipart/complete";
import { initMultipart } from "@/operations/multipart/init";
import { listMultipartParts } from "@/operations/multipart/list-parts";
import { signMultipartPart } from "@/operations/multipart/sign-part";
import { presignUpload } from "@/operations/upload";
import type { DimahS3Api } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/**
 * Builds `s3.api`: the browser client's methods, run in process.
 *
 * Each payload is checked with the same schema as its HTTP endpoint, so a
 * bad payload fails with the same `VALIDATION_ERROR`. Then the call runs
 * the same operation. `options.locals` is trusted and seeds `locals` before
 * the guards run.
 */
export function createS3Api(config: ResolvedConfig): DimahS3Api {
  return {
    upload: async (payload, options) =>
      presignUpload(config, parse(uploadBodySchema, payload, "body"), options),
    confirm: async (payload, options) =>
      confirmUpload(config, parse(ticketBodySchema, payload, "body"), options),
    download: async (payload, options) =>
      presignDownload(
        config,
        parse(downloadQuerySchema, payload, "query"),
        options,
      ),
    catalog: async (options) => getRouteCatalog(config, options),
    delete: async (payload, options) =>
      deleteStoredObject(
        config,
        parse(deleteQuerySchema, payload, "query"),
        options,
      ),
    deleteMany: async (payload, options) =>
      deleteManyObjects(
        config,
        parse(deleteManyBodySchema, payload, "body"),
        options,
      ),
    multipart: {
      init: async (payload, options) =>
        initMultipart(
          config,
          parse(multipartInitBodySchema, payload, "body"),
          options,
        ),
      signPart: async (payload, options) =>
        signMultipartPart(
          config,
          parse(multipartSignPartBodySchema, payload, "body"),
          options,
        ),
      listParts: async (payload, options) =>
        listMultipartParts(
          config,
          parse(ticketBodySchema, payload, "body"),
          options,
        ),
      complete: async (payload, options) =>
        completeMultipart(
          config,
          parse(ticketBodySchema, payload, "body"),
          options,
        ),
      abort: async (payload, options) =>
        abortMultipart(
          config,
          parse(ticketBodySchema, payload, "body"),
          options,
        ),
    },
  };
}

/**
 * Checks an in-process payload. The issue text matches what the HTTP
 * endpoint reports for the same body or query.
 */
function parse<S extends z.ZodType>(
  schema: S,
  payload: unknown,
  source: "body" | "query",
): z.output<S> {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const issue = result.error.issues
    .map((item) => {
      const path = [source, ...item.path.map(String)].join(".");
      return `[${path}] ${item.message}`;
    })
    .join("; ");
  throw s3Error("VALIDATION_ERROR", { issue });
}
