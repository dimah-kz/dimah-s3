import { createId } from "@paralleldrive/cuid2";

/**
 * Schema version the Drizzle tables describe. The parity test checks it
 * against the FumaDB schema.
 */
export const DIMAH_S3_SCHEMA_VERSION = "2.0.0";

/**
 * The FumaDB Drizzle adapter leaves runtime defaults to Drizzle, so the
 * tables fill ids and timestamps the way the other adapters do: a cuid and
 * the app's clock. The SQL defaults only keep generated DDL in line with
 * `sql/<dialect>.sql`.
 */
export const runtimeDefaults = {
  id: () => createId(),
  now: () => new Date(),
};
