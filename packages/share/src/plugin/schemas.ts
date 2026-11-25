import {
  downloadDispositionSchema,
  objectKeySchema,
  optionalTrimmedString,
  trimmedString,
} from "@dimah-s3/core/schema";
import * as z from "zod";
import {
  SHARE_LIST_DEFAULT_LIMIT,
  SHARE_LIST_MAX_LIMIT,
  SHARE_MAX_DOWNLOADS_LIMIT,
  SHARE_PASSWORD_MAX_LENGTH,
} from "@/constants";
import { LABEL_MAX_LENGTH } from "@/schema/schema";

/** Longest `search` text, in characters. */
const MAX_SEARCH_LENGTH = 255;

/** Longest `cursor`, in characters. Real cursors are far shorter. */
const MAX_CURSOR_LENGTH = 2048;

/** Longest `access` proof or file grant, in characters. */
const MAX_PROOF_LENGTH = 4096;

/**
 * Query-string integers arrive as strings; `s3.share.api` may pass
 * numbers. A codec stays compilable (`z.coerce` is not).
 */
function queryInt(schema: z.ZodInt) {
  return z.codec(
    z.union([z.string().trim().regex(z.regexes.integer), schema]),
    schema,
    {
      decode: (value) =>
        typeof value === "number" ? value : Number.parseInt(value, 10),
      encode: (value) => value,
    },
  );
}

/** A query-string boolean: `true` or `false`. `s3.share.api` may pass a boolean. */
const queryBoolean = z.codec(
  z.union([z.enum(["true", "false"]), z.boolean()]),
  z.boolean(),
  {
    decode: (value) => value === true || value === "true",
    encode: (value) => value,
  },
);

/** The statuses a link can have, as `shareLinkStatus` names them. */
const statusSchema = z.enum(["active", "expired", "exhausted", "revoked"]);

/**
 * `status` of `GET /share/links`: one status or a comma-separated list on
 * the wire; `s3.share.api` may pass an array.
 */
const statusQuery = z.codec(
  z.union([z.string(), z.array(z.string())]),
  z.array(statusSchema).min(1).max(4),
  {
    decode: (value) =>
      (typeof value === "string" ? value.split(",") : value).map((status) =>
        status.trim(),
      ) as z.output<typeof statusSchema>[],
    encode: (value) => value.join(","),
  },
);

/** A link token: base64url, as the plugin makes them. */
export const shareTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(64)
  .regex(/^[\w-]+$/, "Invalid token");

const accessSchema = optionalTrimmedString.pipe(
  z.string().max(MAX_PROOF_LENGTH).optional(),
);

const cursorSchema = optionalTrimmedString.pipe(
  z.string().max(MAX_CURSOR_LENGTH).optional(),
);

/** An ISO 8601 date with an offset, a `Date` from server code, or `null`. */
const expiresAtSchema = z
  .union([z.iso.datetime({ offset: true }), z.date(), z.null()])
  .transform((value) => (value === null ? null : new Date(value)))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "Invalid date",
  });

/**
 * Longest `expiresIn`, in seconds: 100 years, so the date the server
 * computes stays in range for every database. Use `null` for no expiry.
 */
const MAX_EXPIRES_IN = 100 * 365 * 24 * 60 * 60;

/** A label: trimmed, and `""` clears it. */
const labelSchema = z
  .string()
  .trim()
  .max(LABEL_MAX_LENGTH)
  .transform((value) => (value === "" ? null : value))
  .nullable();

/** Settings a create or an update may send. The plugin checks its own rules. */
const settingsShape = {
  expiresAt: expiresAtSchema.optional(),
  /** Seconds from now, by the server's clock. Instead of `expiresAt`. */
  expiresIn: z.int().min(1).max(MAX_EXPIRES_IN).optional(),
  password: z
    .string()
    .min(1)
    .max(SHARE_PASSWORD_MAX_LENGTH)
    .nullable()
    .optional(),
  maxDownloads: z
    .int()
    .min(1)
    .max(SHARE_MAX_DOWNLOADS_LIMIT)
    .nullable()
    .optional(),
  label: labelSchema.optional(),
};

const targetSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("object"),
    key: objectKeySchema,
    bucket: trimmedString.optional(),
  }),
  z.strictObject({
    type: z.literal("folder"),
    folderId: trimmedString,
  }),
]);

/** An expiry is a date or a lifetime, not both. */
function oneExpiry(body: { expiresAt?: unknown; expiresIn?: unknown }) {
  return body.expiresAt === undefined || body.expiresIn === undefined;
}

const oneExpiryIssue = {
  message: "Send expiresAt or expiresIn, not both",
  path: ["expiresIn"],
};

/** Body of `POST /share/link`. */
export const createLinkBodySchema = z
  .strictObject({ target: targetSchema, ...settingsShape })
  .refine(oneExpiry, oneExpiryIssue);

/** Body of `PATCH /share/link`. */
export const updateLinkBodySchema = z
  .strictObject({ id: trimmedString, ...settingsShape })
  .refine(oneExpiry, oneExpiryIssue);

/**
 * Query of `GET /share/links`. A target filter is flat: `key` (with
 * `bucket` when the routes use several) or `folderId`, not both.
 */
export const listLinksQuerySchema = z
  .strictObject({
    key: objectKeySchema.optional(),
    bucket: trimmedString.optional(),
    folderId: trimmedString.optional(),
    includeRevoked: queryBoolean.optional(),
    status: statusQuery.optional(),
    limit: queryInt(z.int().min(1).max(SHARE_LIST_MAX_LIMIT)).default(
      SHARE_LIST_DEFAULT_LIMIT,
    ),
    cursor: cursorSchema,
  })
  .refine((query) => query.key === undefined || query.folderId === undefined, {
    message: "Filter by key or by folderId, not both",
    path: ["folderId"],
  });

/** Query of `GET /share/link` and `DELETE /share/link`. */
export const linkIdQuerySchema = z.strictObject({ id: trimmedString });

/** Query of `GET /share/open`. */
export const openLinkQuerySchema = z.strictObject({
  token: shareTokenSchema,
  access: accessSchema,
});

/** Body of `POST /share/unlock`. */
export const unlockLinkBodySchema = z.strictObject({
  token: shareTokenSchema,
  password: z.string().min(1).max(SHARE_PASSWORD_MAX_LENGTH),
});

const sortSchema = z.object({
  field: z.enum(["name", "size", "updatedAt", "createdAt"]),
  direction: z.enum(["asc", "desc"]),
});

/**
 * A query string carries `sort` as JSON (better-fetch serializes objects
 * that way); `s3.share.api` may pass the object.
 */
const sortQuerySchema = z.codec(z.union([z.string(), sortSchema]), sortSchema, {
  decode: (value, ctx) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as z.input<typeof sortSchema>;
    } catch {
      ctx.issues.push({
        code: "invalid_format",
        format: "json",
        input: value,
        message: "Invalid sort",
      });
      return z.NEVER;
    }
  },
  encode: (value) => value,
});

/** Query of `GET /share/items`. `folderId` of `""` is the top of the share. */
export const listSharedQuerySchema = z.strictObject({
  token: shareTokenSchema,
  access: accessSchema,
  folderId: z.string().nullable().optional(),
  search: optionalTrimmedString.pipe(
    z.string().max(MAX_SEARCH_LENGTH).optional(),
  ),
  sort: sortQuerySchema.optional(),
  limit: queryInt(z.int().min(1).max(SHARE_LIST_MAX_LIMIT)).default(
    SHARE_LIST_DEFAULT_LIMIT,
  ),
  cursor: cursorSchema,
});

/** Body of `POST /share/download`. */
export const downloadBodySchema = z.strictObject({
  token: shareTokenSchema,
  access: accessSchema,
  id: trimmedString.optional(),
  disposition: downloadDispositionSchema.optional(),
});

/** Query of `GET /share/file`. */
export const fileQuerySchema = z.strictObject({
  grant: trimmedString.max(MAX_PROOF_LENGTH),
});

export type CreateLinkBody = z.output<typeof createLinkBodySchema>;
export type UpdateLinkBody = z.output<typeof updateLinkBodySchema>;
export type ListLinksQuery = z.output<typeof listLinksQuerySchema>;
export type OpenLinkQuery = z.output<typeof openLinkQuerySchema>;
export type UnlockLinkBody = z.output<typeof unlockLinkBodySchema>;
export type ListSharedQuery = z.output<typeof listSharedQuerySchema>;
export type DownloadBody = z.output<typeof downloadBodySchema>;
export type FileQuery = z.output<typeof fileQuerySchema>;
