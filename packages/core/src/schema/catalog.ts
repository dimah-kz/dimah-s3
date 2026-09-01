import * as z from "zod";
import type { S3RouteName } from "@/types/routes";
import { routeNameSchema } from "./shared";

export const downloadDispositionSchema = z.enum(["inline", "attachment"]);
export const downloadModeSchema = z.enum(["presign", "proxy"]);

export const routeCatalogUploadSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(true),
    fileTypes: z.array(z.string()).optional(),
    maxFileSize: z.int().positive().optional(),
    multipart: z.boolean(),
    checksum: z.boolean().optional(),
    replace: z.literal("overwrite").optional(),
  }),
  z.strictObject({ enabled: z.literal(false) }),
]);

export const routeCatalogDownloadSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(true),
    disposition: downloadDispositionSchema.optional(),
    mode: downloadModeSchema.optional(),
  }),
  z.strictObject({ enabled: z.literal(false) }),
]);

export const routeCatalogDeleteSchema = z.discriminatedUnion("enabled", [
  z.strictObject({ enabled: z.literal(true) }),
  z.strictObject({ enabled: z.literal(false) }),
]);

export const routeCatalogEntrySchema = z.strictObject({
  upload: routeCatalogUploadSchema,
  download: routeCatalogDownloadSchema,
  delete: routeCatalogDeleteSchema,
});

export const routeCatalogResponseSchema = z.strictObject({
  routes: z.record(routeNameSchema, routeCatalogEntrySchema),
});

export type RouteCatalogEntry = z.output<typeof routeCatalogEntrySchema>;
export type RouteCatalogResponse = {
  routes: Record<S3RouteName, RouteCatalogEntry>;
};
