import * as z from "zod";
import type { S3RouteName } from "@/types/routes";
import { routeNameSchema, S3_MAX_EXPIRES_IN } from "./shared";

export const downloadDispositionSchema = z.enum(["inline", "attachment"]);
export const downloadModeSchema = z.enum(["presign", "proxy"]);

export const routeCatalogUploadSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(true),
    fileTypes: z.array(z.string()).optional(),
    maxFileSize: z.int().positive().optional(),
    /** Large files go through multipart upload. */
    multipart: z.boolean(),
    /** Every upload must send a SHA-256 checksum. */
    checksum: z.boolean(),
  }),
  z.strictObject({ enabled: z.literal(false) }),
]);

export const routeCatalogDownloadSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(true),
    /** Longest presign TTL in seconds. Clients may request a shorter `expiresIn`. */
    maxExpiresIn: z.int().positive().max(S3_MAX_EXPIRES_IN),
    disposition: downloadDispositionSchema,
    /** Types that may open inline. Pass to `resolveInlineDisposition`. */
    inlineTypes: z.array(z.string()),
    mode: downloadModeSchema,
  }),
  z.strictObject({ enabled: z.literal(false) }),
]);

export const routeCatalogDeleteSchema = z.strictObject({
  enabled: z.boolean(),
});

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
