import { z } from "zod";

/** Non-empty trimmed string. */
export const trimmedString = z.string().trim().min(1);

/** Optional non-empty trimmed string (empty / missing → omitted). */
export const optionalTrimmedString = z.string().trim().min(1).optional();

export const s3ObjectAclSchema = z.enum(["private", "public-read"]);

export const metadataSchema = z.record(z.string(), z.string());
