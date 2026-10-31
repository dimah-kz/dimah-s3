import {
  confirmBodySchema,
  deleteManyBodySchema,
  deleteQuerySchema,
  downloadQuerySchema,
  multipartInitBodySchema,
  multipartSignPartBodySchema,
  multipartTicketBodySchema,
  s3Error,
  uploadBodySchema,
  type RouteCatalogEntry,
  type RouteCatalogResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import { isEnabled } from "@/helpers/features";
import { confirmUpload } from "@/operations/confirm";
import { deleteStoredObject } from "@/operations/delete";
import { deleteManyObjects } from "@/operations/delete-many";
import { presignDownload } from "@/operations/download";
import { abortMultipart } from "@/operations/multipart/abort";
import { completeMultipart } from "@/operations/multipart/complete";
import { initMultipart } from "@/operations/multipart/init";
import { listMultipartParts } from "@/operations/multipart/list-parts";
import { signMultipartPart } from "@/operations/multipart/sign-part";
import { runOperation } from "@/operations/run-operation";
import { presignUpload } from "@/operations/upload";
import type { DimahS3Api, S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";

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
      confirmUpload(config, parse(confirmBodySchema, payload, "body"), options),
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
          parse(multipartTicketBodySchema, payload, "body"),
          options,
        ),
      complete: async (payload, options) =>
        completeMultipart(
          config,
          parse(multipartTicketBodySchema, payload, "body"),
          options,
        ),
      abort: async (payload, options) =>
        abortMultipart(
          config,
          parse(multipartTicketBodySchema, payload, "body"),
          options,
        ),
    },
  };
}

/**
 * Lists every route and the features a client may use
 * (`GET /routes`, `s3.api.catalog`). It runs the instance guard like every
 * other call.
 */
export function getRouteCatalog(
  config: ResolvedConfig,
  options: S3ServerCallOptions = {},
): Promise<RouteCatalogResponse> {
  return runOperation(config, "catalog", options, async () =>
    buildRouteCatalog(config),
  );
}

/**
 * The catalog of a resolved config. It reports effective values: `checksum`
 * is on whenever `verifyContent` is, and `inlineTypes` is the allow-list a
 * download really uses (`[]` when nothing opens inline).
 */
export function buildRouteCatalog(
  config: ResolvedConfig,
): RouteCatalogResponse {
  const routes: RouteCatalogResponse["routes"] = {};
  for (const [name, route] of Object.entries(config.routes)) {
    routes[name] = catalogEntry(route);
  }
  return { routes };
}

function catalogEntry(route: ResolvedRoute): RouteCatalogEntry {
  const { upload, download } = route;
  return {
    upload: isEnabled(upload)
      ? {
          enabled: true,
          ...(upload.fileTypes ? { fileTypes: [...upload.fileTypes] } : {}),
          ...(upload.maxFileSize !== undefined
            ? { maxFileSize: upload.maxFileSize }
            : {}),
          multipart: upload.multipart.enabled,
          checksum: upload.checksum,
        }
      : { enabled: false },
    download: isEnabled(download)
      ? {
          enabled: true,
          maxExpiresIn: download.maxExpiresIn,
          disposition: download.disposition,
          inlineTypes: download.inlineTypes ? [...download.inlineTypes] : [],
          mode: download.mode,
        }
      : { enabled: false },
    delete: { enabled: route.delete.enabled },
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
