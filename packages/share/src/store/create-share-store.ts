import { SHARE_SCHEMA_VERSION, type DimahS3ShareClient } from "@/fuma-db";
import { createLinkStore, type ShareLinkStore } from "./link-store";
import { checkSchemaVersion } from "./schema-version";

/** The link store over one FumaDB client. */
export type ShareStore = {
  links: ShareLinkStore;
  /** Throws unless the database is at the schema the store uses. */
  checkSchema: () => Promise<void>;
};

/**
 * Creates the link store. The first query checks the schema version, so a
 * database at another version throws instead of being read with the wrong
 * columns. A failed check runs again on the next query.
 */
export function createShareStore(client: DimahS3ShareClient): ShareStore {
  let checked: Promise<void> | undefined;
  const checkSchema = () => {
    checked ??= checkSchemaVersion(client).catch((error: unknown) => {
      checked = undefined;
      throw error;
    });
    return checked;
  };
  return {
    links: createLinkStore(async () => {
      await checkSchema();
      return client.orm(SHARE_SCHEMA_VERSION);
    }),
    checkSchema,
  };
}
