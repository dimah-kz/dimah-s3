/*
 * `@dimah-s3/core/schema`: the Zod schemas of the protocol, for servers and
 * plugins that validate requests. Browser code never needs them, so they
 * live outside the root entry and keep Zod out of client bundles.
 */
export {
  contentTypeSchema,
  fileNameSchema,
  metadataSchema,
  objectKeySchema,
  optionalChecksumSchema,
  optionalContentTypeSchema,
  optionalFileNameSchema,
  optionalTrimmedString,
  partNumberSchema,
  routeNameSchema,
  s3ObjectAclSchema,
  sha256ChecksumSchema,
  trimmedString,
  uploadTicketSchema,
} from "./shared";
export { ticketBodySchema, uploadBodySchema } from "./upload";
export { downloadQuerySchema, fileQuerySchema } from "./download";
export { deleteManyBodySchema, deleteQuerySchema } from "./delete";
export {
  downloadDispositionSchema,
  downloadModeSchema,
  routeCatalogEntrySchema,
  routeCatalogResponseSchema,
} from "./catalog";
export {
  multipartInitBodySchema,
  multipartSignPartBodySchema,
} from "./multipart";
